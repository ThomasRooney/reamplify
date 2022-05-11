import { table } from './models/tables';
import { TableConfig } from './tableConfig';

export function gqlResponseToModel<T>(items: any, tableConfig?: TableConfig<any>): T {
  let matchesNextToken = false;
  let matchesItems = false;
  if (items && typeof items === 'object') {
    const cpy: any = Array.isArray(items) ? [] : {};
    for (const [k, v] of Object.entries(items)) {
      if (k === '__typename') {
        continue;
      }
      if (k === 'items') {
        matchesNextToken = true;
      } else if (k === 'nextToken') {
        matchesItems = true;
      } else {
        matchesNextToken = false;
        matchesItems = false;
      }
      const connections: any = tableConfig?.connections;
      const maybeConnection: any = (table as any)?.[connections?.[k]?.table];
      cpy[k] = gqlResponseToModel(v, maybeConnection);
      if ((cpy[k] === null || cpy[k] === undefined) && connections?.[k]?.list) {
        cpy[k] = [];
      }
    }
    if (matchesNextToken && matchesItems) {
      return cpy['items'];
    }
    return cpy;
  }
  return items;
}
