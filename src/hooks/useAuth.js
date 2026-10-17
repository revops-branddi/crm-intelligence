import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
export function useAuth() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(Boolean(supabase)),
    [error, setError] = useState('');
  useEffect(() => {
    // Remove credentials left by the previous version. Never migrate them silently.
    localStorage.removeItem('pipedriveToken');
    localStorage.removeItem('geminiModel');
    if (!supabase) return;
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (mounted) {
          setUser(data.session?.user || null);
          setError(error ? 'Não foi possível recuperar a sessão.' : '');
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setLoading(false);
          setError('Não foi possível conectar ao serviço de login.');
        }
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user || null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  const login = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError('Não foi possível iniciar o login.');
  };
  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) setError('Não foi possível encerrar a sessão. Tente novamente.');
    else setUser(null);
  };
  return { user, loading, error, login, logout };
}
