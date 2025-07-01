import { useState, useEffect } from "react";

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

const TOKEN_KEY = "promptops_token";

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem(TOKEN_KEY),
    isLoading: true,
  });

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        try {
          const response = await fetch("/api/auth/me", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const user = await response.json();
            setAuthState({ user, token, isLoading: false });
          } else {
            localStorage.removeItem(TOKEN_KEY);
            setAuthState({ user: null, token: null, isLoading: false });
          }
        } catch (error) {
          localStorage.removeItem(TOKEN_KEY);
          setAuthState({ user: null, token: null, isLoading: false });
        }
      } else {
        setAuthState({ user: null, token: null, isLoading: false });
      }
    };

    initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Login failed");
    }

    const { token, user } = await response.json();
    localStorage.setItem(TOKEN_KEY, token);
    setAuthState({ user, token, isLoading: false });
    return { user, token };
  };

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error) {
        // Ignore logout errors
      }
    }

    localStorage.removeItem(TOKEN_KEY);
    setAuthState({ user: null, token: null, isLoading: false });
  };

  return {
    ...authState,
    login,
    logout,
  };
}

export function hasRole(user: User | null, roles: string[]): boolean {
  return user ? roles.includes(user.role) : false;
}

export function getAuthHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
