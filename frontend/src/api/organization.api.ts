import { api } from './client';
import { Organization } from '../types/auth';

export const organizationApi = {
  listOrganizations: () =>
    api.get<{ organizations: Organization[] }>('/organizations'),

  getOrganizationById: (organizationId: string) =>
    api.get<{ organization: Organization }>(`/organizations/${organizationId}`),

  createOrganization: (name: string) =>
    api.post<{ organization: Organization }>('/organizations', { name }),
};
