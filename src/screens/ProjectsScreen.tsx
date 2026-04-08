// src/screens/ProjectsScreen.tsx
// ─────────────────────────────────────────────────────────────────────
// Maestro — Project Management
// Users can create/view/select projects. Each project groups recordings.
// ─────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Dimensions, Modal, ActivityIndicator,
  RefreshControl, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase, db } from '../services/supabase';

const { width } = Dimensions.get('window');

interface Project {
  id: string;
  name: string;
  bpm: number;
  key: string;
  created_at: string;
}

interface Recording {
  id: string;
  project_name: string;
  file_url: string;
  duration_ms: number;
  bpm: number;
  key: string;
  auto_tune_pct: number;
  instruments: string[];
  created_at: string;
}

export function ProjectsScreen() {
  const navigation = useNavigation<any>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBpm, setNewBpm] = useState('90');
  const [newKey, setNewKey] = useState('C');
  const [creating, setCreating] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const loadData = useCallback(async () => {
    try {
      const { data: pData, error: pErr } = await db.getProjects('anonymous');
      if (pData && !pErr) setProjects(pData as any);

      // Fetch all recordings to group by project globally
      const { data: rData } = await supabase.from('recordings').select('*');
      if (rData) setRecordings(rData);
    } catch (e) {
      console.error('[Projects] Load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []));

  const createProject = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await db.createProject({
        userId: 'anonymous',
        name: newName.trim(),
        bpm: parseInt(newBpm) || 90,
        key: newKey || 'C',
      });
      if (data && !error) {
        setProjects(prev => [data, ...prev]);
        setShowCreate(false);
        setNewName('');
        // Navigate to Studio with this project
        navigation.navigate('Studio', {
          screen: 'StudioMain',
          params: { projectId: data.id, projectName: data.name },
        });
      }
    } catch (e) {
      console.error('[Projects] Create error:', e);
    } finally {
      setCreating(false);
    }
  };

  const openProject = (project: Project) => {
    navigation.navigate('Studio', {
      screen: 'StudioMain',
      params: { projectId: project.id, projectName: project.name },
    });
  };

  const deleteProject = async (projectId: string, projectName: string) => {
    Alert.alert(
      'Delete Project',
      `Remove "${projectName}"? All recordings will be kept in history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('projects').delete().eq('id', projectId);
              if (error) throw error;
              setProjects(prev => prev.filter(p => p.id !== projectId));
            } catch (e) {
              console.error('[Projects] Delete error:', e);
              Alert.alert('Error', 'Could not delete project');
            }
          },
        },
      ]
    );
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <View style={s.container}>
      <LinearGradient colors={['#0B0B12', '#13131E']} style={StyleSheet.absoluteFillObject} />

      {/* Header */}
      <Animated.View style={[s.header, { opacity: fadeAnim }]}>
        <Text style={s.title}>Projects</Text>
        <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)}>
          <LinearGradient
            colors={['#D4AF37', '#B8962E']}
            style={s.createGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <Text style={s.createTxt}>+ New</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Project list */}
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor="#D4AF37"
          />
        }
      >
        {loading ? (
          <ActivityIndicator color="#D4AF37" size="large" style={{ marginTop: 60 }} />
        ) : projects.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyEmoji}>🎵</Text>
            <Text style={s.emptyTitle}>No Projects Yet</Text>
            <Text style={s.emptySubtitle}>Tap "+ New" to create your first project</Text>
          </View>
        ) : (
          projects.map((proj, idx) => {
            const isExpanded = expandedProjectId === proj.id;
            const projectRecordings = recordings.filter(r => r.project_name === proj.name);
            
            return (
              <View key={proj.id} style={s.projectWrap}>
                <TouchableOpacity
                  style={s.projectCard}
                  onPress={() => setExpandedProjectId(isExpanded ? null : proj.id)}
                  activeOpacity={0.7}
                >
                  <View style={s.cardLeft}>
                    <View style={[s.cardDot, { backgroundColor: COLORS[idx % COLORS.length] }]} />
                    <View>
                      <Text style={s.cardName} numberOfLines={1}>{proj.name}</Text>
                      <Text style={s.cardMeta}>
                        {projectRecordings.length} Recordings · {formatDate(proj.created_at)}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.cardArrow}>{isExpanded ? '↓' : '→'}</Text>
                </TouchableOpacity>
                
                {isExpanded && (
                  <View style={s.expandedArea}>
                    <View style={s.actionBtnRow}>
                      <TouchableOpacity
                        style={[s.studioBtn, { flex: 1 }]}
                        onPress={() => openProject(proj)}
                      >
                        <Text style={s.studioBtnTxt}>✓ Enter Studio</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.studioBtn, { flex: 1, backgroundColor: 'rgba(255,59,92,0.2)', marginLeft: 8 }]}
                        onPress={() => deleteProject(proj.id, proj.name)}
                      >
                        <Text style={[s.studioBtnTxt, { color: '#FF3B5C' }]}>🗑 Delete</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {projectRecordings.length === 0 ? (
                      <Text style={s.noRecTxt}>No recordings in this project yet.</Text>
                    ) : (
                      projectRecordings.map(rec => (
                        <View key={rec.id} style={s.recCard}>
                          <Text style={s.recName}>Recording (ID: {rec.id.substring(0,4)})</Text>
                          <Text style={s.recMeta}>{rec.bpm} BPM · Tune: {rec.auto_tune_pct}%</Text>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Create Project Modal */}
      <Modal visible={showCreate} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <LinearGradient colors={['#D4AF37', '#B8962E']} style={s.modalBar} />
            <Text style={s.modalTitle}>Create Project</Text>

            <Text style={s.inputLabel}>Project Name</Text>
            <TextInput
              style={s.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="My Song"
              placeholderTextColor="rgba(240,230,200,0.2)"
              autoFocus
            />

            <View style={s.inputRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={s.inputLabel}>Key</Text>
                <TextInput
                  style={s.input}
                  value={newKey}
                  onChangeText={setNewKey}
                  placeholder="C"
                  placeholderTextColor="rgba(240,230,200,0.2)"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={s.inputLabel}>BPM</Text>
                <TextInput
                  style={s.input}
                  value={newBpm}
                  onChangeText={setNewBpm}
                  placeholder="90"
                  placeholderTextColor="rgba(240,230,200,0.2)"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowCreate(false)}>
                <Text style={s.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={createProject} disabled={creating}>
                <LinearGradient colors={['#D4AF37', '#B8962E']} style={s.modalConfirmGrad}>
                  {creating ? (
                    <ActivityIndicator color="#0B0B12" size="small" />
                  ) : (
                    <Text style={s.modalConfirmTxt}>Create & Open</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const COLORS = ['#D4AF37', '#00D9C0', '#A78BFA', '#FF3B5C', '#60A5FA', '#34D399'];

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B12' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
  },
  title: { color: '#F0E6C8', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  createBtn: { borderRadius: 20, overflow: 'hidden' },
  createGrad: { paddingHorizontal: 20, paddingVertical: 10 },
  createTxt: { color: '#0B0B12', fontSize: 14, fontWeight: '800' },

  scroll: { paddingHorizontal: 20, paddingBottom: 100 },

  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#F0E6C8', fontSize: 20, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { color: 'rgba(240,230,200,0.4)', fontSize: 14 },

  projectWrap: { marginBottom: 10 },
  projectCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  cardName: { color: '#F0E6C8', fontSize: 16, fontWeight: '700', marginBottom: 3 },
  cardMeta: { color: 'rgba(240,230,200,0.4)', fontSize: 12 },
  cardArrow: { color: '#D4AF37', fontSize: 16, fontWeight: '800' },
  
  expandedArea: {
    padding: 12, backgroundColor: 'rgba(0,0,0,0.4)',
    borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
    borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(255,255,255,0.06)',
  },
  actionBtnRow: {
    flexDirection: 'row', marginBottom: 10, gap: 8,
  },
  studioBtn: {
    paddingVertical: 10, backgroundColor: 'rgba(212,175,55,0.1)',
    borderRadius: 8, alignItems: 'center', marginBottom: 10,
  },
  studioBtnTxt: { color: '#D4AF37', fontWeight: '700' },
  noRecTxt: { color: 'rgba(240,230,200,0.4)', fontSize: 12, textAlign: 'center', marginVertical: 10 },
  recCard: {
    padding: 10, backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8, marginBottom: 6,
  },
  recName: { color: '#F0E6C8', fontSize: 14, fontWeight: '600' },
  recMeta: { color: 'rgba(240,230,200,0.5)', fontSize: 11, marginTop: 4 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    width: width * 0.88, backgroundColor: '#13131E',
    borderRadius: 22, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)',
  },
  modalBar: { height: 3 },
  modalTitle: {
    color: '#F0E6C8', fontSize: 18, fontWeight: '700',
    paddingHorizontal: 22, paddingTop: 20, paddingBottom: 16,
  },
  inputLabel: {
    color: 'rgba(240,230,200,0.5)', fontSize: 12, fontWeight: '600',
    paddingHorizontal: 22, marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
    padding: 14, marginHorizontal: 22, marginBottom: 14,
    color: '#F0E6C8', fontSize: 15,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  inputRow: { flexDirection: 'row', paddingHorizontal: 0 },

  modalBtnRow: {
    flexDirection: 'row', borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)', marginTop: 8,
  },
  modalCancel: {
    flex: 1, paddingVertical: 16, alignItems: 'center',
    borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.06)',
  },
  modalCancelTxt: { color: 'rgba(240,230,200,0.4)', fontSize: 14, fontWeight: '600' },
  modalConfirm: { flex: 1, overflow: 'hidden' },
  modalConfirmGrad: { paddingVertical: 16, alignItems: 'center' },
  modalConfirmTxt: { color: '#0B0B12', fontSize: 14, fontWeight: '700' },
});

export default ProjectsScreen;
