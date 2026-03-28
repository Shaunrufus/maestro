// src/screens/GuruScreen.tsx
// GURU AI Screen — full-screen overlay showing coaching feedback.
// Launched from the golden Guru button on StudioScreen.
// Renders: Guru avatar + feedback + quick actions (analyze, lyrics, mix tips)

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text,
  TextInput, View, ActivityIndicator,
} from 'react-native';
import { Colors, Radius, Spacing } from '../theme';

type MessageRole = 'guru' | 'user';
interface Message { role: MessageRole; text: string; timestamp: Date; }

const QUICK_ACTIONS = [
  { label: 'Analyze my voice',     prompt: 'Analyze my last recording and give me vocal feedback.' },
  { label: 'Fix my pitch',         prompt: 'My pitch was off. What exercises should I practice?' },
  { label: 'Write a chorus',       prompt: 'Help me write a catchy chorus for my song.' },
  { label: 'Suggest instruments',  prompt: 'What instruments should I layer for a soulful vibe?' },
  { label: 'Mix tips',             prompt: 'Give me mixing tips for my recording.' },
];

const GURU_BACKEND = 'https://YOUR_BACKEND_URL'; // Railway URL

export const GuruScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'guru',
      text: "Namaste! I'm GURU — your personal music teacher. What are we working on today?",
      timestamp: new Date(),
    },
  ]);
  const [input,   setInput  ] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Guru avatar pulse animation
  const pulse = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue:1,   duration:1600, easing:Easing.inOut(Easing.ease), useNativeDriver:true }),
      Animated.timing(pulse, { toValue:0.7, duration:1600, easing:Easing.inOut(Easing.ease), useNativeDriver:true }),
    ])).start();
  }, []);

  // Auto-analyze if launched with a recording URI
  useEffect(() => {
    if (route.params?.autoAnalyze && route.params?.recordingUri) {
      sendToGuru('Analyze my last recording and give me specific vocal feedback.', route.params.recordingUri);
    }
  }, []);

  const sendToGuru = async (text: string, recordingUri?: string) => {
    if (!text.trim() && !recordingUri) return;
    const userMsg: Message = { role:'user', text: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      let response: Response;

      if (recordingUri) {
        // If there's a recording, send it for analysis
        const form = new FormData();
        form.append('file', { uri:recordingUri, name:'recording.wav', type:'audio/wav' } as any);
        form.append('note', text);
        response = await fetch(`${GURU_BACKEND}/guru/analyze`, { method:'POST', body:form });
      } else {
        // Text-only chat with Guru
        response = await fetch(`${GURU_BACKEND}/guru/chat`, {
          method:  'POST',
          headers: { 'Content-Type':'application/json' },
          body:    JSON.stringify({ message: text }),
        });
      }

      if (!response.ok) throw new Error('Guru is meditating. Try again.');

      const data = await response.json();
      const replyText = data.feedback ?? data.reply ?? data.message ?? 'Guru is thinking...';

      const guruMsg: Message = { role:'guru', text:replyText, timestamp:new Date() };
      setMessages(prev => [...prev, guruMsg]);
    } catch (e: any) {
      const errMsg: Message = {
        role: 'guru',
        text: `Hmm, I couldn't connect. Check your backend URL in autotuneService.ts. (${e.message})`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated:true }), 100);
    }
  };

  return (
    <View style={s.root}>
      {/* Glows */}
      <View style={s.glowGold}   />
      <View style={s.glowPurple} />
      <View style={s.veil}       />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTx}>←</Text>
        </Pressable>
        <View style={s.headerCenter}>
          {/* Guru avatar */}
          <Animated.View style={[s.avatarGlow, { opacity:pulse }]} />
          <View style={s.avatar}>
            <Text style={s.avatarTx}>AI</Text>
          </View>
          <View>
            <Text style={s.headerTitle}>GURU</Text>
            <Text style={s.headerSub}>Your music teacher</Text>
          </View>
        </View>
        <View style={{ width:40 }} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={s.messages}
        contentContainerStyle={{ padding:Spacing.lg, gap:12 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated:true })}
      >
        {messages.map((msg, i) => (
          <View
            key={i}
            style={[s.bubble, msg.role === 'user' ? s.bubbleUser : s.bubbleGuru]}
          >
            {msg.role === 'guru' && (
              <View style={s.guruBadge}>
                <Text style={s.guruBadgeTx}>G</Text>
              </View>
            )}
            <Text style={[s.bubbleTx, msg.role === 'user' && s.bubbleTxUser]}>
              {msg.text}
            </Text>
          </View>
        ))}
        {loading && (
          <View style={[s.bubble, s.bubbleGuru]}>
            <View style={s.guruBadge}><Text style={s.guruBadgeTx}>G</Text></View>
            <ActivityIndicator color={Colors.gold} size="small" />
          </View>
        )}
      </ScrollView>

      {/* Quick actions */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.quickRow}
        contentContainerStyle={{ paddingHorizontal:Spacing.lg, gap:8 }}
      >
        {QUICK_ACTIONS.map((qa, i) => (
          <Pressable
            key={i}
            style={s.quickChip}
            onPress={() => sendToGuru(qa.prompt)}
          >
            <Text style={s.quickChipTx}>{qa.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.inputArea}
      >
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Guru anything..."
            placeholderTextColor={Colors.textMuted}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => sendToGuru(input)}
          />
          <Pressable
            style={[s.sendBtn, !input.trim() && { opacity:0.4 }]}
            onPress={() => sendToGuru(input)}
            disabled={!input.trim() || loading}
          >
            <Text style={s.sendTx}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const s = StyleSheet.create({
  root:         { flex:1, backgroundColor:Colors.bg },
  glowGold:     { position:'absolute', width:280, height:280, borderRadius:140, backgroundColor:Colors.goldGlow, top:-60, right:-40 },
  glowPurple:   { position:'absolute', width:250, height:250, borderRadius:125, backgroundColor:'rgba(106,42,230,0.3)', bottom:100, left:-60 },
  veil:         { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.5)' },

  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingTop:56, paddingHorizontal:Spacing.lg, paddingBottom:Spacing.lg },
  backBtn:      { width:40, height:40, borderRadius:20, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, alignItems:'center', justifyContent:'center' },
  backTx:       { fontSize:20, color:Colors.textSecondary },
  headerCenter: { flexDirection:'row', alignItems:'center', gap:12 },
  avatarGlow:   { position:'absolute', width:56, height:56, borderRadius:28, backgroundColor:Colors.goldGlow, left:-3, top:-3 },
  avatar:       { width:50, height:50, borderRadius:25, backgroundColor:Colors.gold, alignItems:'center', justifyContent:'center', shadowColor:Colors.gold, shadowOffset:{width:0,height:0}, shadowOpacity:0.8, shadowRadius:12, elevation:8 },
  avatarTx:     { fontSize:14, fontWeight:'800', color:Colors.bg },
  headerTitle:  { fontSize:16, fontWeight:'700', color:Colors.gold },
  headerSub:    { fontSize:11, color:Colors.textMuted },

  messages:     { flex:1 },
  bubble:       { flexDirection:'row', alignItems:'flex-start', gap:10, maxWidth:'88%' },
  bubbleGuru:   { alignSelf:'flex-start' },
  bubbleUser:   { alignSelf:'flex-end', flexDirection:'row-reverse' },
  guruBadge:    { width:28, height:28, borderRadius:14, backgroundColor:Colors.goldBg, borderWidth:1, borderColor:Colors.gold, alignItems:'center', justifyContent:'center', marginTop:2 },
  guruBadgeTx:  { fontSize:11, fontWeight:'700', color:Colors.gold },
  bubbleTx:     { fontSize:14, color:Colors.textSecondary, lineHeight:22, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.lg, padding:Spacing.md, flex:1 },
  bubbleTxUser: { backgroundColor:Colors.tealBg, borderColor:Colors.teal, color:Colors.textPrimary },

  quickRow:     { maxHeight:44, marginBottom:8 },
  quickChip:    { backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.pill, paddingHorizontal:14, paddingVertical:8, height:34, justifyContent:'center' },
  quickChipTx:  { fontSize:12, color:Colors.textSecondary },

  inputArea:    { paddingHorizontal:Spacing.lg, paddingBottom:Spacing.xl },
  inputRow:     { flexDirection:'row', gap:8, alignItems:'flex-end' },
  input:        { flex:1, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.lg, padding:Spacing.md, color:Colors.textPrimary, fontSize:14, maxHeight:100 },
  sendBtn:      { width:44, height:44, borderRadius:22, backgroundColor:Colors.gold, alignItems:'center', justifyContent:'center', shadowColor:Colors.gold, shadowOffset:{width:0,height:0}, shadowOpacity:0.7, shadowRadius:8, elevation:6 },
  sendTx:       { fontSize:18, fontWeight:'700', color:Colors.bg },
});
