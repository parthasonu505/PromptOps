import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: (token: string, user: User) => {
        set({ token, user });
      },
      logout: () => {
        set({ token: null, user: null });
      },
      isAuthenticated: () => {
        const { token } = get();
        return !!token;
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);

// Hook for components to use auth state
export const useAuth = () => {
  const { token, user, login, logout, isAuthenticated } = useAuthStore();
  
  return {
    token,
    user,
    login,
    logout,
    isAuthenticated: isAuthenticated(),
    isLoading: false, // We're not doing any async loading here
  };
};

// Helper function to check if user has specific role
export const hasRole = (user: User | null, roles: string[]): boolean => {
  if (!user) return false;
  return roles.includes(user.role);
};

// Get authorization headers for API calls
export const getAuthHeaders = (): Record<string, string> => {
  const { token } = useAuthStore.getState();
  return token ? { Authorization: `Bearer ${token}` } : {};
};