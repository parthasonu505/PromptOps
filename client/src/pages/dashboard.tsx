import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PromptsTable } from "@/components/prompts-table";
import { getAuthHeaders } from "@/lib/auth";
import { Code, CheckCircle, Clock, GitBranch } from "lucide-react";

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["/api/prompts/stats"],
    queryFn: async () => {
      const response = await fetch("/api/prompts/stats", {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }
      return response.json();
    },
  });

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Code className="text-primary h-5 w-5" />
                  </div>
                </div>
                <div className="ml-4 w-0 flex-1">
                  <dt className="text-sm font-medium text-muted-foreground truncate">
                    Total Prompts
                  </dt>
                  <dd className="text-2xl font-semibold text-foreground">
                    {stats?.totalPrompts || 0}
                  </dd>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                    <CheckCircle className="text-green-600 dark:text-green-300 h-5 w-5" />
                  </div>
                </div>
                <div className="ml-4 w-0 flex-1">
                  <dt className="text-sm font-medium text-muted-foreground truncate">
                    Approved
                  </dt>
                  <dd className="text-2xl font-semibold text-foreground">
                    {stats?.approvedPrompts || 0}
                  </dd>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                    <Clock className="text-orange-600 dark:text-orange-300 h-5 w-5" />
                  </div>
                </div>
                <div className="ml-4 w-0 flex-1">
                  <dt className="text-sm font-medium text-muted-foreground truncate">
                    Pending Review
                  </dt>
                  <dd className="text-2xl font-semibold text-foreground">
                    {stats?.pendingPrompts || 0}
                  </dd>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                    <GitBranch className="text-slate-600 dark:text-slate-300 h-5 w-5" />
                  </div>
                </div>
                <div className="ml-4 w-0 flex-1">
                  <dt className="text-sm font-medium text-muted-foreground truncate">
                    Active Versions
                  </dt>
                  <dd className="text-2xl font-semibold text-foreground">
                    {stats?.activeVersions || 0}
                  </dd>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Content Tabs */}
        <div className="mb-6">
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All Prompts</TabsTrigger>
              <TabsTrigger value="my">My Prompts</TabsTrigger>
              <TabsTrigger value="favorites">Favorites</TabsTrigger>
              <TabsTrigger value="recent">Recently Updated</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-6">
              <PromptsTable />
            </TabsContent>
            <TabsContent value="my" className="mt-6">
              <PromptsTable />
            </TabsContent>
            <TabsContent value="favorites" className="mt-6">
              <PromptsTable />
            </TabsContent>
            <TabsContent value="recent" className="mt-6">
              <PromptsTable />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
