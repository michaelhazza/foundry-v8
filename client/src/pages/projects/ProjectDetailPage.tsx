import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ArrowLeft, Upload, Database, Settings } from 'lucide-react';

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Source {
  id: number;
  name: string;
  type: string;
  status: string;
  metadata: any;
  createdAt: string;
}

interface SourcesResponse {
  data: Source[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => apiGet<{ data: Project }>(`/projects/${projectId}`),
  });

  const { data: sources, isLoading: sourcesLoading } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => apiGet<SourcesResponse>(`/projects/${projectId}/sources`),
  });

  if (projectLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {project?.data.name}
          </h1>
          {project?.data.description && (
            <p className="text-gray-600">{project.data.description}</p>
          )}
        </div>
        <Button variant="outline">
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project?.data.sourceCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{project?.data.status}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {project?.data.createdAt
                ? new Date(project.data.createdAt).toLocaleDateString()
                : '-'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Data Sources</CardTitle>
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Add Source
          </Button>
        </CardHeader>
        <CardContent>
          {sourcesLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : sources?.data.length === 0 ? (
            <div className="text-center py-8">
              <Database className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No sources</h3>
              <p className="mt-1 text-sm text-gray-500">
                Add a data source to start processing.
              </p>
              <div className="mt-6">
                <Button>
                  <Upload className="mr-2 h-4 w-4" />
                  Add Source
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {sources?.data.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <h3 className="font-medium">{source.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span className="capitalize">{source.type}</span>
                      <span>•</span>
                      <span className="capitalize">{source.status}</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
