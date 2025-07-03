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
