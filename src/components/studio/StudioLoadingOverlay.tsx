import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';
export type LoadingStage = 'autotune' | 'analyzing' | 'generating' | 'saving' | 'mixing';
const STAGE_CONFIG: Record<LoadingStage, {color: string; label: string; sublabel: string}> = {
  autotune:{color:'#00D9C0',label:'Tuning',sublabel:'Pitch correction'},
  analyzing:{color:'#D4AF37',label:'Listening',sublabel:'Reading your song'},
  generating:{color:'#A855F7',label:'Creating',sublabel:'Building your band'},
  saving:{color:'#3B82F6',label:'Saving',sublabel:'To cloud'},
  mixing:{color:'#FF3B5C',label:'Mixing',sublabel:'Final blend'},
};
export const StudioLoadingOverlay = ({stage, visible}: {stage: LoadingStage, visible: boolean}) => {
  const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG.analyzing;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const gPulse = useRef(new Animated.Value(1)).current;
  const bars = useRef(Array.from({length:5},()=>new Animated.Value(0.3))).current;
  useEffect(() => {
    if (!visible) return;
    const ringAnim = (ring: Animated.Value, delay: number) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(ring, {toValue:1,duration:1400,easing:Easing.out(Easing.ease),useNativeDriver:true}),
      Animated.timing(ring, {toValue:0,duration:0,useNativeDriver:true}),
    ]));
    const r1 = ringAnim(ring1, 0);
    const r2 = ringAnim(ring2, 460);
    const r3 = ringAnim(ring3, 920);
    r1.start(); r2.start(); r3.start();
    const gp = Animated.loop(Animated.sequence([
      Animated.timing(gPulse, {toValue:1.08,duration:700,easing:Easing.inOut(Easing.ease),useNativeDriver:true}),
      Animated.timing(gPulse, {toValue:1,duration:700,easing:Easing.inOut(Easing.ease),useNativeDriver:true}),
    ]));
    gp.start();
    const barAnims = bars.map((bar,i) => Animated.loop(Animated.sequence([
      Animated.delay(i*120),
      Animated.timing(bar, {toValue:0.5+Math.random()*0.5,duration:300+i*80,useNativeDriver:true}),
      Animated.timing(bar, {toValue:0.2,duration:300,useNativeDriver:true}),
    ])));
    barAnims.forEach(a => a.start());
    return () => {
      r1.stop(); r2.stop(); r3.stop(); gp.stop();
      barAnims.forEach(a => a.stop());
    };
  }, [visible, stage]);
  if (!visible) return null;
  return (
    <View style={s.overlay}>
      <View style={s.card}>
        {[ring1, ring2, ring3].map((ring, i) => (
          <Animated.View key={i} style={[s.ring, {width:80+i*28,height:80+i*28,borderRadius:(80+i*28)/2,borderColor:cfg.color,opacity:ring.interpolate({inputRange:[0,0.2,1],outputRange:[0,0.6,0]}),transform:[{scale:ring.interpolate({inputRange:[0,1],outputRange:[1,1.6]})}]}]}/>
        ))}
        <Animated.View style={{transform:[{scale:gPulse}]}}>
          <Text style={[s.guitarIcon, {textShadowColor:cfg.color}]}>🎸</Text>
        </Animated.View>
        <Text style={[s.label, {color:cfg.color}]}>{cfg.label}</Text>
        <Text style={s.sublabel}>{cfg.sublabel}</Text>
        <View style={s.barsRow}>
          {bars.map((bar,i) => (
            <Animated.View key={i} style={[s.eqBar, {backgroundColor:cfg.color,transform:[{scaleY:bar}]}]}/>
          ))}
        </View>
      </View>
    </View>
  );
};
const s = StyleSheet.create({
  overlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(11,11,18,0.82)',zIndex:100,alignItems:'center',justifyContent:'center'},
  card:{alignItems:'center',justifyContent:'center',gap:8,width:200},
  ring:{position:'absolute',borderWidth:1.5},
  guitarIcon:{fontSize:52,textShadowOffset:{width:0,height:0},textShadowRadius:20},
  label:{fontSize:20,fontWeight:'700',marginTop:8,letterSpacing:1},
  sublabel:{fontSize:12,color:'rgba(255,255,255,0.45)',marginTop:2},
  barsRow:{flexDirection:'row',alignItems:'flex-end',gap:4,height:28,marginTop:12},
  eqBar:{width:6,height:24,borderRadius:3},
});
