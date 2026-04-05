// src/screens/ProjectsScreen.tsx
// ─────────────────────────────────────────────────────────────────────
// Maestro — Project Management
// Users can create/view/select projects. Each project groups recordings.
// ─────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Dimensions, Modal, ActivityIndicator,
  RefreshControl,
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
  recording_count?: number;
}

export function ProjectsScreen() {
  const navigation = useNavigation<any>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBpm, setNewBpm] = useState('90');
  const [newKey, setNewKey] = useState('C');
  const [creating, setCreating] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const loadProjects = useCallback(async () => {
    try {
      const { data, error } = await db.getProjects('anonymous');
      if (data && !error) {
        setProjects(data);
      }
    } catch (e) {
      console.error('[Projects] Load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadProjects();
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
            onRefresh={() => { setRefreshing(true); loadProjects(); }}
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
          projects.map((proj, idx) => (
            <TouchableOpacity
              key={proj.id}
              style={s.projectCard}
              onPress={() => openProject(proj)}
              activeOpacity={0.7}
            >
              <View style={s.cardLeft}>
                <View style={[s.cardDot, { backgroundColor: COLORS[idx % COLORS.length] }]} />
                <View>
                  <Text style={s.cardName} numberOfLines={1}>{proj.name}</Text>
                  <Text style={s.cardMeta}>
                    {proj.key} · {proj.bpm} BPM · {formatDate(proj.created_at)}
                  </Text>
                </View>
              </View>
              <Text style={s.cardArrow}>→</Text>
            </TouchableOpacity>
          ))
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

  projectCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  cardName: { color: '#F0E6C8', fontSize: 16, fontWeight: '700', marginBottom: 3 },
  cardMeta: { color: 'rgba(240,230,200,0.4)', fontSize: 12 },
  cardArrow: { color: 'rgba(240,230,200,0.3)', fontSize: 18 },

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
