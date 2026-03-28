// src/screens/PaywallScreen.tsx
// Subscription paywall — shown when user taps a PRO instrument.
// Plans: Monthly ₹199 / Annual ₹1499 (saves 37%)
// Payment: Razorpay
//
// Install: npm install react-native-razorpay
// (requires a custom dev build — NOT compatible with plain Expo Go)
// Build: eas build --profile development --platform android

import React, { useState } from 'react';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Colors, Radius, Spacing } from '../theme';

// TODO: Uncomment after running: npm install react-native-razorpay
// import RazorpayCheckout from 'react-native-razorpay';

const RAZORPAY_KEY_ID = 'YOUR_RAZORPAY_KEY_ID'; // from razorpay.com dashboard

const PLANS = [
  {
    id:       'monthly',
    label:    'Monthly',
    price:    '₹199',
    period:   '/month',
    subId:    'YOUR_RAZORPAY_MONTHLY_PLAN_ID',
    popular:  false,
  },
  {
    id:       'annual',
    label:    'Annual',
    price:    '₹1,499',
    period:   '/year',
    subId:    'YOUR_RAZORPAY_ANNUAL_PLAN_ID',
    popular:  true,
    savings:  'Save 37%',
  },
];

const PRO_FEATURES = [
  '🥁  Tabla — authentic Indian percussion',
  '🪈  Bansuri Flute — classical Indian wind',
  '🎸  Sitar — raag-mode string instrument',
  '🎻  Orchestral pack — strings, brass, choir',
  '✦   Unlimited recordings (free: 3/day)',
  '🧠  Advanced Guru AI analysis',
  '⚡  Priority backend processing',
];

export const PaywallScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const [selected, setSelected] = useState('annual');
  const [loading,  setLoading ] = useState(false);

  const unlockingInstrument = route.params?.instrument ?? 'Pro instruments';

  const subscribe = async () => {
    const plan = PLANS.find(p => p.id === selected)!;
    setLoading(true);

    try {
      // ── RAZORPAY CHECKOUT ──
      // Uncomment after installing react-native-razorpay + eas build:
      //
      // const options = {
      //   key:             RAZORPAY_KEY_ID,
      //   subscription_id: plan.subId,
      //   name:            'MAESTRO Pro',
      //   description:     `${plan.label} subscription`,
      //   prefill:         { name: 'Shaun', email: 'you@email.com' },
      //   theme:           { color: Colors.gold },
      // };
      // const paymentData = await RazorpayCheckout.open(options);
      // // Payment success — update Supabase
      // await supabase.from('subscriptions').insert({
      //   user_id: (await supabase.auth.getUser()).data.user?.id,
      //   razorpay_sub_id: paymentData.razorpay_subscription_id,
      //   plan: selected,
      //   status: 'active',
      //   current_period_end: new Date(Date.now() + (selected === 'annual' ? 365 : 30) * 86400000),
      // });
      // navigation.goBack();

      // ── PLACEHOLDER until Razorpay is configured ──
      Alert.alert(
        '🚧 Payment Not Configured Yet',
        'Add your Razorpay key and uncomment the checkout code in PaywallScreen.tsx.',
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      if (e.code !== 'USER_CANCELLED') {
        Alert.alert('Payment failed', e.description ?? e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <View style={s.glowGold}   />
      <View style={s.glowPurple} />
      <View style={s.veil}       />

      {/* Close button */}
      <Pressable style={s.closeBtn} onPress={() => navigation.goBack()}>
        <Text style={s.closeTx}>✕</Text>
      </Pressable>

      <ScrollView contentContainerStyle={s.content}>
        {/* Crown icon */}
        <View style={s.crownWrap}>
          <Text style={s.crown}>♛</Text>
        </View>
        <Text style={s.headline}>Unlock {unlockingInstrument}</Text>
        <Text style={s.sub}>Get MAESTRO Pro and access everything in the studio</Text>

        {/* Plan cards */}
        <View style={s.plansRow}>
          {PLANS.map(plan => (
            <Pressable
              key={plan.id}
              style={[s.planCard, selected === plan.id && s.planCardActive]}
              onPress={() => setSelected(plan.id)}
            >
              {plan.popular && (
                <View style={s.popularBadge}>
                  <Text style={s.popularTx}>Best value</Text>
                </View>
              )}
              {plan.savings && (
                <View style={s.savingsBadge}>
                  <Text style={s.savingsTx}>{plan.savings}</Text>
                </View>
              )}
              <Text style={s.planLabel}>{plan.label}</Text>
              <Text style={s.planPrice}>{plan.price}</Text>
              <Text style={s.planPeriod}>{plan.period}</Text>
              <View style={[s.radioOuter, selected === plan.id && s.radioOuterActive]}>
                {selected === plan.id && <View style={s.radioInner} />}
              </View>
            </Pressable>
          ))}
        </View>

        {/* Features list */}
        <View style={s.featureList}>
          {PRO_FEATURES.map((feat, i) => (
            <Text key={i} style={s.featureTx}>{feat}</Text>
          ))}
        </View>

        {/* Subscribe CTA */}
        <Pressable
          style={[s.cta, loading && { opacity:0.7 }]}
          onPress={subscribe}
          disabled={loading}
        >
          <Text style={s.ctaTx}>
            {loading ? 'Processing...' : `Subscribe ${PLANS.find(p=>p.id===selected)?.price}`}
          </Text>
        </Pressable>

        <Text style={s.terms}>
          Cancel anytime. Billed through Razorpay.{'\n'}
          Subscriptions are non-refundable after 7 days.
        </Text>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root:          { flex:1, backgroundColor:Colors.bg },
  glowGold:      { position:'absolute', width:280, height:280, borderRadius:140, backgroundColor:Colors.goldGlow, top:-60, right:-40 },
  glowPurple:    { position:'absolute', width:260, height:260, borderRadius:130, backgroundColor:'rgba(106,42,230,0.3)', bottom:80, left:-50 },
  veil:          { position:'absolute', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(11,11,18,0.52)' },
  closeBtn:      { position:'absolute', top:50, right:Spacing.lg, zIndex:10, width:36, height:36, borderRadius:18, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, alignItems:'center', justifyContent:'center' },
  closeTx:       { fontSize:14, color:Colors.textSecondary },
  content:       { paddingTop:80, paddingHorizontal:Spacing.xl, paddingBottom:40, alignItems:'center' },
  crownWrap:     { width:80, height:80, borderRadius:40, backgroundColor:Colors.goldBg, borderWidth:1.5, borderColor:Colors.gold, alignItems:'center', justifyContent:'center', marginBottom:20, shadowColor:Colors.gold, shadowOffset:{width:0,height:0}, shadowOpacity:0.7, shadowRadius:16, elevation:8 },
  crown:         { fontSize:36 },
  headline:      { fontSize:26, fontWeight:'800', color:Colors.textPrimary, textAlign:'center', marginBottom:8 },
  sub:           { fontSize:14, color:Colors.textSecondary, textAlign:'center', lineHeight:22, marginBottom:28 },
  plansRow:      { flexDirection:'row', gap:12, marginBottom:24, width:'100%' },
  planCard:      { flex:1, backgroundColor:Colors.bgCard, borderWidth:1, borderColor:Colors.border, borderRadius:Radius.lg, padding:Spacing.lg, alignItems:'center', position:'relative', paddingTop:28 },
  planCardActive:{ backgroundColor:Colors.goldBg, borderColor:Colors.gold, shadowColor:Colors.gold, shadowOffset:{width:0,height:0}, shadowOpacity:0.4, shadowRadius:12, elevation:6 },
  popularBadge:  { position:'absolute', top:-1, left:'50%', transform:[{translateX:-30}], backgroundColor:Colors.gold, borderRadius:Radius.pill, paddingHorizontal:10, paddingVertical:3 },
  popularTx:     { fontSize:9, fontWeight:'700', color:Colors.bg },
  savingsBadge:  { backgroundColor:'rgba(0,217,192,0.2)', borderRadius:Radius.pill, paddingHorizontal:8, paddingVertical:2, marginBottom:6 },
  savingsTx:     { fontSize:10, fontWeight:'600', color:Colors.teal },
  planLabel:     { fontSize:13, color:Colors.textSecondary, marginBottom:6 },
  planPrice:     { fontSize:26, fontWeight:'800', color:Colors.textPrimary },
  planPeriod:    { fontSize:11, color:Colors.textMuted, marginBottom:16 },
  radioOuter:    { width:20, height:20, borderRadius:10, borderWidth:1.5, borderColor:Colors.border, alignItems:'center', justifyContent:'center' },
  radioOuterActive:{ borderColor:Colors.gold },
  radioInner:    { width:10, height:10, borderRadius:5, backgroundColor:Colors.gold },
  featureList:   { width:'100%', backgroundColor:Colors.bgCard, borderRadius:Radius.lg, borderWidth:1, borderColor:Colors.border, padding:Spacing.lg, gap:10, marginBottom:24 },
  featureTx:     { fontSize:13, color:Colors.textSecondary, lineHeight:20 },
  cta:           { width:'100%', backgroundColor:Colors.gold, borderRadius:Radius.pill, paddingVertical:17, alignItems:'center', marginBottom:16, shadowColor:Colors.gold, shadowOffset:{width:0,height:0}, shadowOpacity:0.7, shadowRadius:12, elevation:8 },
  ctaTx:         { fontSize:16, fontWeight:'800', color:Colors.bg },
  terms:         { fontSize:11, color:Colors.textHint, textAlign:'center', lineHeight:18 },
});
