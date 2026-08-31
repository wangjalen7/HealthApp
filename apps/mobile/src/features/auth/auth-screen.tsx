import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabaseConfig } from '../../lib/config';
import { supabase } from '../../lib/supabase';

type Mode = 'signIn' | 'signUp' | 'reset';

export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const title = mode === 'signIn' ? 'Welcome back' : mode === 'signUp' ? 'Create your account' : 'Reset password';

  async function submit() {
    setFeedback('');
    if (!supabaseConfig.isConfigured) {
      setFeedback('Add your Supabase URL and anonymous key to .env, then restart Expo.');
      return;
    }
    if (!email.includes('@') || (mode !== 'reset' && password.length < 8)) {
      setFeedback('Use a valid email and a password of at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setFeedback(error.message);
          return;
        }
        router.replace('/(app)');
        return;
      }
      if (mode === 'signUp') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) {
          setFeedback(error.message);
          return;
        }
        if (data.session) {
          router.replace('/(app)');
          return;
        }
        router.replace({ pathname: '/(auth)/check-email', params: { email: email.trim(), purpose: 'confirm' } });
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: 'healthapp://reset-password' });
      if (error) {
        setFeedback(error.message);
        return;
      }
      router.replace({ pathname: '/(auth)/check-email', params: { email: email.trim(), purpose: 'reset' } });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not continue.');
    } finally {
      setBusy(false);
    }
  }

  return <View style={styles.page}>
    <Text style={styles.eyebrow}>HEALTHAPP</Text><Text style={styles.title}>{title}</Text>
    <Text style={styles.copy}>A private, simple place for your daily wellness data.</Text>
    {!supabaseConfig.isConfigured && <Text style={styles.warning}>Supabase is not configured yet. You can still explore the app structure.</Text>}
    <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email" placeholderTextColor="#718096" style={styles.input} value={email} onChangeText={setEmail} />
    {mode !== 'reset' && <TextInput autoCapitalize="none" autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} secureTextEntry placeholder="Password" placeholderTextColor="#718096" style={styles.input} value={password} onChangeText={setPassword} />}
    {feedback ? <Text accessibilityLiveRegion="polite" style={styles.error}>{feedback}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={styles.button}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mode === 'signIn' ? 'Sign in' : mode === 'signUp' ? 'Create account' : 'Send reset link'}</Text>}</Pressable>
    {mode === 'signIn' && <><Link href="/(auth)/forgot-password" style={styles.link}>Forgot password?</Link><Link href="/(auth)/sign-up" style={styles.link}>New here? Create an account</Link></>}
    {mode !== 'signIn' && <Link href="/(auth)/sign-in" style={styles.link}>Back to sign in</Link>}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F7FAFC' }, eyebrow: { color: '#16776A', fontWeight: '800', letterSpacing: 2, marginBottom: 8 }, title: { color: '#102A43', fontSize: 32, fontWeight: '800' }, copy: { color: '#52606D', fontSize: 16, lineHeight: 23, marginTop: 8, marginBottom: 24 }, warning: { color: '#8A4B00', backgroundColor: '#FFF3D6', padding: 12, borderRadius: 10, marginBottom: 12 }, input: { backgroundColor: '#fff', borderColor: '#D9E2EC', borderWidth: 1, borderRadius: 12, color: '#102A43', fontSize: 16, padding: 15, marginBottom: 12 }, error: { backgroundColor: '#FDECEC', borderRadius: 10, color: '#B42318', marginBottom: 10, padding: 11 }, button: { alignItems: 'center', backgroundColor: '#16776A', borderRadius: 12, minHeight: 52, justifyContent: 'center', marginTop: 4 }, buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' }, link: { color: '#16776A', fontSize: 15, marginTop: 18, textAlign: 'center' },
});
