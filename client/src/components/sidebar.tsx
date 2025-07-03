import { Link, useLocation } from "wouter";
import { useAuth, hasRole } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Terminal, Code, GitBranch, TestTube, CheckCircle, 
  Users, Key, FileText, Moon, Sun, Brain, Settings 
} from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  if (!user) return null;

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const isActive = (path: string) => location === path;

  return (
    <div className="hidden md:flex md:flex-shrink-0">
      <div className="flex flex-col w-64 bg-sidebar-background border-r border-sidebar-border">
        {/* Logo and Company */}
        <div className="flex items-center h-16 px-6 border-b border-sidebar-border">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
              <Terminal className="text-sidebar-primary-foreground text-sm" />
            </div>
            <span className="text-lg font-semibold text-sidebar-foreground">PromptOps</span>
          </div>
        </div>

        {/* User Profile */}
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-sidebar-accent rounded-full flex items-center justify-center">
              <span className="text-sidebar-accent-foreground font-medium text-sm">
                {getInitials(user.firstName, user.lastName)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-sidebar-foreground/70 truncate">
                {user.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </p>
            </div>
            <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
              Online
            </Badge>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
          <Link href="/">
            <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive("/") 
                ? "text-sidebar-primary bg-sidebar-accent" 
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}>
              <Code className="mr-3 h-4 w-4" />
              Prompts
              <Badge variant="secondary" className="ml-auto">
                24
              </Badge>
            </a>
          </Link>

          <Link href="/version-control">
            <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive("/version-control") 
                ? "text-sidebar-primary bg-sidebar-accent" 
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}>
              <GitBranch className="mr-3 h-4 w-4" />
              Version Control
            </a>
          </Link>

          <Link href="/testing-sandbox">
            <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive("/testing-sandbox") 
                ? "text-sidebar-primary bg-sidebar-accent" 
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}>
              <TestTube className="mr-3 h-4 w-4" />
              Testing Sandbox
            </a>
          </Link>

          <Link href="/llm-comparison">
            <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive("/llm-comparison") 
                ? "text-sidebar-primary bg-sidebar-accent" 
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}>
              <Brain className="mr-3 h-4 w-4" />
              LLM Comparison
            </a>
          </Link>

          <Link href="/llm-settings">
            <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive("/llm-settings") 
                ? "text-sidebar-primary bg-sidebar-accent" 
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}>
              <Settings className="mr-3 h-4 w-4" />
              LLM Settings
            </a>
          </Link>

          <Link href="/github-models">
            <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive("/github-models") 
                ? "text-sidebar-primary bg-sidebar-accent" 
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}>
              <svg className="mr-3 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
              </svg>
              GitHub Models
            </a>
          </Link>

          {hasRole(user, ["engineering_lead", "admin"]) && (
            <Link href="/approvals">
              <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive("/approvals") 
                  ? "text-sidebar-primary bg-sidebar-accent" 
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}>
                <CheckCircle className="mr-3 h-4 w-4" />
                Approvals
                <Badge variant="secondary" className="ml-auto bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200">
                  3
                </Badge>
              </a>
            </Link>
          )}

          <div className="pt-4">
            <Separator className="mb-4" />
            <p className="px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
              Administration
            </p>
            <div className="space-y-1">
              {hasRole(user, ["admin", "engineering_lead"]) && (
                <Link href="/user-management">
                  <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive("/user-management") 
                      ? "text-sidebar-primary bg-sidebar-accent" 
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}>
                    <Users className="mr-3 h-4 w-4" />
                    User Management
                  </a>
                </Link>
              )}

              <Link href="/api-sdk">
                <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive("/api-sdk") 
                    ? "text-sidebar-primary bg-sidebar-accent" 
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}>
                  <Key className="mr-3 h-4 w-4" />
                  API & SDK
                </a>
              </Link>

              {hasRole(user, ["admin", "engineering_lead"]) && (
                <Link href="/audit-trail">
                  <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive("/audit-trail") 
                      ? "text-sidebar-primary bg-sidebar-accent" 
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}>
                    <FileText className="mr-3 h-4 w-4" />
                    Audit Trail
                  </a>
                </Link>
              )}

              {hasRole(user, ["admin"]) && (
                <Link href="/github-settings">
                  <a className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive("/github-settings") 
                      ? "text-sidebar-primary bg-sidebar-accent" 
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}>
                    <svg className="mr-3 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                    </svg>
                    GitHub Settings
                  </a>
                </Link>
              )}
            </div>
          </div>
        </nav>

        {/* Theme Toggle and Logout */}
        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center justify-between px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-lg transition-colors">
            <span className="flex items-center">
              {theme === "light" ? <Sun className="mr-3 h-4 w-4" /> : <Moon className="mr-3 h-4 w-4" />}
              Dark Mode
            </span>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={logout}
          >
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
