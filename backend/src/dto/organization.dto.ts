import { IOrganization } from '../models/organization.model';
import { TenantStatus } from '../types';

export interface OrganizationResponseDTO {
  id: string;
  name: string;
  status: TenantStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const toOrganizationResponseDTO = (org: IOrganization): OrganizationResponseDTO => {
  return {
    id: org._id.toString(),
    name: org.name,
    status: org.status,
    createdBy: org.createdBy.toString(),
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
};
