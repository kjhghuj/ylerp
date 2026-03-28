import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from './src/api';

export interface AuthUser {
    id: string;
    username: string;
    displayName: string;
    role: 'owner' | 'admin' | 'viewer';
    parentId: string | null;
    permissions: string[];
}

interface AuthContextType {
    user: AuthUser | null;
    token: string | null;
    isAuthenticated: boolean;
    loading: boolean;
    login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(() => {
        // dev mode token injection
        if (import.meta.env.DEV) {
            localStorage.setItem('erp_token', 'dev-token');
            return 'dev-token';
        }
        return localStorage.getItem('erp_token');
    });
    const [loading, setLoading] = useState(true);

    // Restore session on mount
    useEffect(() => {
        if (token) {
            fetchMe();
        } else {
            setLoading(false);
        }
    }, []);

    const fetchMe = async () => {
        try {
            const res = await api.get('/auth/me');
            setUser(res.data);
        } catch (error) {
            // Token expired or invalid
            localStorage.removeItem('erp_token');
            setToken(null);
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    const login = async (username: string, password: string) => {
        try {
            const res = await api.post('/auth/login', { username, password });
            const { token: newToken, user: userData } = res.data;

            localStorage.setItem('erp_token', newToken);
            setToken(newToken);
            setUser(userData);

            return { success: true };
        } catch (error: any) {
            const message = error.response?.data?.error || '登录失败';
            return { success: false, error: message };
        }
    };

    const logout = () => {
        localStorage.removeItem('erp_token');
        setToken(null);
        setUser(null);
    };

    const refreshUser = async () => {
        await fetchMe();
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isAuthenticated: !!user && !!token,
            loading,
            login,
            logout,
            refreshUser,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
