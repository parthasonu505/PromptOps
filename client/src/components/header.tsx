import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CreatePromptModal } from "@/components/create-prompt-modal";
import { useAuth } from "@/lib/auth";
import { Menu, Search, Bell, Plus } from "lucide-react";

export function Header() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuth();

  if (!user) return null;

  return (
    <>
      <div className="relative z-10 flex-shrink-0 flex h-16 bg-background shadow-sm border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          className="px-4 border-r border-border md:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
        
        <div className="flex-1 px-4 flex justify-between items-center sm:px-6 lg:px-8">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-semibold text-foreground">Prompt Management</h1>
            <Badge variant="secondary" className="bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
              Production Environment
            </Badge>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Search */}
            <div className="relative hidden sm:block">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                className="w-64 pl-10"
                placeholder="Search prompts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 block h-2 w-2 rounded-full bg-destructive" />
            </Button>
            
            {/* Create New Button */}
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Prompt
            </Button>
          </div>
        </div>
      </div>

      <CreatePromptModal 
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
      />
    </>
  );
}
