import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, Clock, User, Eye, GitCommit } from "lucide-react";

export default function VersionControl() {
  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Version Control</h1>
          <p className="text-muted-foreground mt-2">
            Manage prompt versions with automated versioning, history tracking, and rollback capabilities.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Version History */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <GitBranch className="mr-2 h-5 w-5" />
                  Version History
                </CardTitle>
                <CardDescription>
                  Track changes and manage different versions of your prompts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Version Entry */}
                  <div className="flex items-start space-x-4 p-4 border rounded-lg">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <GitCommit className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">v2.1.3</h4>
                          <p className="text-sm text-muted-foreground">
                            Improved response accuracy and added context handling
                          </p>
                        </div>
                        <Badge variant="secondary">Latest</Badge>
                      </div>
                      <div className="flex items-center mt-2 space-x-4 text-xs text-muted-foreground">
                        <span className="flex items-center">
                          <User className="mr-1 h-3 w-3" />
                          Sarah Chen
                        </span>
                        <span className="flex items-center">
                          <Clock className="mr-1 h-3 w-3" />
                          2 hours ago
                        </span>
                        <span className="flex items-center">
                          <Eye className="mr-1 h-3 w-3" />
                          124 uses
                        </span>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">View</Button>
                      <Button variant="outline" size="sm">Compare</Button>
                    </div>
                  </div>

                  {/* Previous versions */}
                  <div className="flex items-start space-x-4 p-4 border rounded-lg opacity-75">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                        <GitCommit className="h-4 w-4 text-slate-500" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">v2.1.2</h4>
                          <p className="text-sm text-muted-foreground">
                            Fixed issue with variable substitution
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center mt-2 space-x-4 text-xs text-muted-foreground">
                        <span className="flex items-center">
                          <User className="mr-1 h-3 w-3" />
                          John Doe
                        </span>
                        <span className="flex items-center">
                          <Clock className="mr-1 h-3 w-3" />
                          1 day ago
                        </span>
                        <span className="flex items-center">
                          <Eye className="mr-1 h-3 w-3" />
                          89 uses
                        </span>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">View</Button>
                      <Button variant="outline" size="sm">Rollback</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Version Info Panel */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Current Version</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Version</label>
                  <p className="text-lg font-mono">v2.1.3</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      Active
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Environment</label>
                  <p className="text-sm">Production</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last Modified</label>
                  <p className="text-sm">2 hours ago by Sarah Chen</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Version Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Versions</span>
                  <span className="text-sm font-medium">12</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Active Branches</span>
                  <span className="text-sm font-medium">3</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Usage Count</span>
                  <span className="text-sm font-medium">1,247</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Success Rate</span>
                  <span className="text-sm font-medium">98.5%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
