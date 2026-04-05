import React, {useRef, useState} from 'react';
import {Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
const {width: SW, height: SH} = Dimensions.get('window');
const C = {bg:'rgba(11,11,18,0.88)',border:'rgba(0,217,192,0.35)',teal:'#00D9C0',gold:'#D4AF37',textPri:'#FFFFFF',textSec:'rgba(255,255,255,0.55)',textMut:'rgba(255,255,255,0.3)',handle:'rgba(255,255,255,0.15)'};
export const FloatingLyricsWindow = ({visible, onClose}: {visible: boolean, onClose: () => void}) => {
  const [lyrics, setLyrics] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [minimised, setMinimised] = useState(false);
  const pan = useRef(new Animated.ValueXY({x: 16, y: SH - 320})).current;
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {pan.setOffset({x: (pan.x as any)._value, y: (pan.y as any)._value}); pan.setValue({x: 0, y: 0});},
    onPanResponderMove: Animated.event([null, {dx: pan.x, dy: pan.y}], {useNativeDriver: false}),
    onPanResponderRelease: () => {
      pan.flattenOffset();
      const x = Math.max(0, Math.min(SW - 260, (pan.x as any)._value));
      const y = Math.max(40, Math.min(SH - 200, (pan.y as any)._value));
      Animated.spring(pan, {toValue: {x, y}, useNativeDriver: false, friction: 8}).start();
    },
  })).current;
  if (!visible) return null;
  return (
    <Animated.View style={[s.window, {transform: [{translateX: pan.x}, {translateY: pan.y}]}, minimised && s.windowMin]}>
      <View style={s.handle} {...panResponder.panHandlers}>
        <View style={s.handleGrip} />
        <Text style={s.handleLabel}>📝 Lyrics</Text>
        <View style={s.handleActions}>
          <Pressable style={s.handleBtn} onPress={() => setFontSize(f => Math.max(11, f - 2))}>
            <Text style={s.handleBtnTx}>A−</Text>
          </Pressable>
          <Pressable style={s.handleBtn} onPress={() => setFontSize(f => Math.min(28, f + 2))}>
            <Text style={s.handleBtnTx}>A+</Text>
          </Pressable>
          <Pressable style={s.handleBtn} onPress={() => setMinimised(m => !m)}>
            <Text style={s.handleBtnTx}>{minimised ? '□' : '—'}</Text>
          </Pressable>
          <Pressable style={[s.handleBtn, s.closeBtn]} onPress={onClose}>
            <Text style={s.closeBtnTx}>✕</Text>
          </Pressable>
        </View>
      </View>
      {!minimised && (
        <>
          <TextInput style={[s.lyricsInput, {fontSize}]} value={lyrics} onChangeText={setLyrics} multiline placeholder="Paste or type your lyrics here..." placeholderTextColor={C.textMut} textAlignVertical="top" scrollEnabled />
          <View style={s.footer}>
            <Pressable style={s.footerBtn} onPress={() => setLyrics('')}>
              <Text style={s.footerBtnTx}>Clear</Text>
            </Pressable>
            <Text style={s.charCount}>{lyrics.length} chars</Text>
          </View>
        </>
      )}
    </Animated.View>
  );
};
const s = StyleSheet.create({
  window:{position:'absolute',width:260,zIndex:999,backgroundColor:C.bg,borderRadius:14,borderWidth:1.5,borderColor:C.border,shadowColor:C.teal,shadowOffset:{width:0,height:0},shadowOpacity:0.4,shadowRadius:12,elevation:20,overflow:'hidden'},
  windowMin:{width:160},
  handle:{flexDirection:'row',alignItems:'center',backgroundColor:C.handle,paddingHorizontal:10,paddingVertical:8,gap:6},
  handleGrip:{width:20,height:4,borderRadius:2,backgroundColor:C.textMut},
  handleLabel:{flex:1,fontSize:11,fontWeight:'600',color:C.teal},
  handleActions:{flexDirection:'row',gap:4},
  handleBtn:{width:24,height:24,borderRadius:12,backgroundColor:'rgba(255,255,255,0.1)',alignItems:'center',justifyContent:'center'},
  handleBtnTx:{fontSize:9,color:C.textSec,fontWeight:'600'},
  closeBtn:{backgroundColor:'rgba(255,59,92,0.2)'},
  closeBtnTx:{fontSize:10,color:'#FF3B5C',fontWeight:'700'},
  lyricsInput:{color:C.textPri,padding:12,minHeight:140,maxHeight:240,lineHeight:22},
  footer:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:12,paddingVertical:6,borderTopWidth:1,borderTopColor:'rgba(255,255,255,0.08)'},
  footerBtn:{paddingHorizontal:10,paddingVertical:4,borderRadius:20,backgroundColor:'rgba(255,255,255,0.08)'},
  footerBtnTx:{fontSize:10,color:C.textSec},
  charCount:{fontSize:9,color:C.textMut},
});
