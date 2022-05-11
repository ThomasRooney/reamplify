import { AnyTable } from '@reamplify/schema/lib/models/tables';
import { RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ITable, StreamViewType, Table, TableProps } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { TableConfig } from '@reamplify/schema/lib/tableConfig';

export interface ReamplifyTableConfigStack extends Stack {
  config: AnyTable;
  table: ITable;
  workspace: string;
}

function convertAttributeType(tableData: AnyTable, slice: string[] | string): AttributeType {
  if (Array.isArray(slice) && slice.length > 1) {
    return AttributeType.STRING;
  } else if (Array.isArray(slice) && slice.length === 1) {
    return convertAttributeType(tableData, slice[0]);
  } else if (!Array.isArray(slice)) {
    switch (tableData.primitiveTypes[slice as keyof typeof tableData.primitiveTypes]) {
      case 'boolean':
      case 'string':
      default:
        return AttributeType.STRING;
      case 'number':
        return AttributeType.NUMBER;
    }
  }
  throw new Error(`unexpected type in table ${tableData.name}: ${slice}`);
}

export const table_suffix = (props: { appName: string; workspace: string }) => `.${props.appName}.${props.workspace}`;

export interface TableStackProps extends StackProps {
  scope: Construct;
  tableData: TableConfig<any>;
  stateAssetRemovalPolicy: RemovalPolicy;
  workspace: string;
  appName: string;
  stackName: string;
}

// We have a seperate stack per-table so that, in future, we can ensure that each table
export const tableConfigToTableStack = (props: TableStackProps): ReamplifyTableConfigStack => {
  const { scope, tableData, workspace } = props;

  const tableConfigClass = class ReamplifyTableConfigStack extends Stack {
    public readonly config: AnyTable;
    public readonly table: ITable;
    public readonly workspace: string;
    constructor(scope: Construct, id: string, props: TableStackProps) {
      super(scope, id, props);
      Tags.of(this).add('stack', 'ReamplifyTableStack');
      Tags.of(this).add('workspace', workspace);
      Tags.of(this).add('table', tableData.name);
      this.workspace = workspace;

      this.config = tableData;

      const streamSpecification: StreamViewType | undefined = tableData.streamConfiguration as StreamViewType;
      const tableProps: TableProps = {
        tableName: tableData.name + table_suffix(props),
        billingMode: BillingMode.PAY_PER_REQUEST,
        partitionKey: {
          name: tableData.partitionKey.name,
          type: AttributeType.STRING,
        },
        pointInTimeRecovery: true,
        timeToLiveAttribute: '_ttl',
        stream: streamSpecification,
      };

      const table = new Table(this, 'DynamoDBTable', tableProps);
      table.applyRemovalPolicy(props.stateAssetRemovalPolicy);
      // sometimes we need to export tableStreamArn -- this resolves "Deadly embrace" when
      // lambda streams are disabled.
      if (streamSpecification) {
        this.exportValue(table.tableStreamArn);
      }
      this.table = table;
      this.exportValue(table.tableName);
      this.exportValue(table.tableArn);
      Object.values(tableData.index).forEach((lsi) => {
        if (lsi.fields[0] === tableData.partitionKey.name) {
          if (!lsi.sortKey) {
            throw new Error(`unexpected index configuration for table ${tableData.name} index ${JSON.stringify(lsi)}`);
          }
          table.addLocalSecondaryIndex({
            indexName: lsi.name,
            sortKey: {
              name: lsi.sortKey,
              type: convertAttributeType(tableData, lsi.fields.slice(1)),
            },
          });
        } else {
          table.addGlobalSecondaryIndex({
            indexName: lsi.name,
            partitionKey: {
              name: lsi.partitionKey,
              type: convertAttributeType(tableData, lsi.fields[0]),
            },
            sortKey: lsi.sortKey
              ? {
                  name: lsi.sortKey,
                  type: convertAttributeType(tableData, lsi.fields.slice(1)),
                }
              : undefined,
          });
        }
      });
    }
  };

  return new tableConfigClass(scope, props.stackName, props);
};
