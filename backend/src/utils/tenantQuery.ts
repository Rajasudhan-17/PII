import mongoose, { Model, FilterQuery, UpdateQuery } from 'mongoose';
import { AppError } from './AppError';

export const validateObjectId = (id: string, name: string = 'Resource ID'): mongoose.Types.ObjectId => {
  if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
    throw AppError.notFound(`Invalid ${name} format.`, 'RESOURCE_NOT_FOUND');
  }
  return new mongoose.Types.ObjectId(id);
};

export const tenantScope = <T>(
  organizationId: string,
  filter: FilterQuery<T> = {}
): FilterQuery<T> => {
  const orgObjectId = validateObjectId(organizationId, 'Organization ID');
  return {
    ...filter,
    organizationId: orgObjectId,
  };
};

export const tenantFindOne = async <T>(
  model: Model<T>,
  organizationId: string,
  filter: FilterQuery<T>
) => {
  const scopedFilter = tenantScope<T>(organizationId, filter);
  return model.findOne(scopedFilter);
};

export const tenantFind = async <T>(
  model: Model<T>,
  organizationId: string,
  filter: FilterQuery<T>
) => {
  const scopedFilter = tenantScope<T>(organizationId, filter);
  return model.find(scopedFilter);
};

export const tenantUpdateOne = async <T>(
  model: Model<T>,
  organizationId: string,
  filter: FilterQuery<T>,
  update: UpdateQuery<T>
) => {
  const scopedFilter = tenantScope<T>(organizationId, filter);
  return model.updateOne(scopedFilter, update);
};

export const tenantDeleteOne = async <T>(
  model: Model<T>,
  organizationId: string,
  filter: FilterQuery<T>
) => {
  const scopedFilter = tenantScope<T>(organizationId, filter);
  return model.deleteOne(scopedFilter);
};
