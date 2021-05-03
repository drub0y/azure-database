import { ContainerDefinition, ContainerResponse, Database, DataType, IndexKind } from '@azure/cosmos';
import { COSMOS_DB_MODULE_OPTIONS } from "./cosmos-db.constants";
import { AZURE_COSMOS_DB_ENTITY } from './cosmos-db.decorators';
import { AzureCosmosDbOptions } from './cosmos-db.interface';
import { getConnectionToken, getModelToken, pluralize } from './cosmos-db.utils';

export interface PartitionKeyValues {
  PartitionKey: string;
}

export function createAzureCosmosDbProviders(
  connectionName?: string,
  models: { dto: any; collection?: string }[] = [],
) {
  const providers = (models || []).map((model) => ({
    provide: getModelToken(model.dto.name),
    useFactory: async (database: Database, options: AzureCosmosDbOptions) => {
      const containerName = model.collection ?? pluralize(model.dto.name);
      let coResponse: ContainerResponse;

      if (options.enableCreateIfNotExists) {
        const entityDescriptor = Reflect.getMetadata(AZURE_COSMOS_DB_ENTITY, model.dto) as PartitionKeyValues;
        const partitionKey = entityDescriptor ? entityDescriptor.PartitionKey : null;
        const containerOptions: ContainerDefinition = {
          id: containerName,
          uniqueKeyPolicy: {
            uniqueKeys: [],
          },
        };

        // If the container has a DateTime field we add a Range Index
        // ref: https://docs.microsoft.com/en-us/azure/cosmos-db/working-with-dates#indexing-datetimes-for-range-queries
        if (Object.values(entityDescriptor).indexOf('DateTime') > -1) {
          containerOptions.indexingPolicy = {
            includedPaths: [
              {
                path: `/*`,
                indexes: [
                  {
                    kind: IndexKind.Range,
                    dataType: DataType.String,
                    precision: -1,
                  },
                ],
              },
            ],
          };
        }

        for (const key in entityDescriptor) {
          if (entityDescriptor.hasOwnProperty(key)) {
            const element = entityDescriptor[key];
            if (element === 'UniqueKey') {
              containerOptions.uniqueKeyPolicy.uniqueKeys.push({ paths: [`/${key}`] });
            }
          }
        }

        if (partitionKey != null) {
          containerOptions.partitionKey = {
            paths: [`/${partitionKey}`],
          };
        }

        coResponse = await database.containers.createIfNotExists(containerOptions);
      } else {
        coResponse = await database.container(containerName).read();
      }

      return coResponse.container;
    },
    inject: [getConnectionToken(connectionName), COSMOS_DB_MODULE_OPTIONS],
  }));
  return providers;
}
