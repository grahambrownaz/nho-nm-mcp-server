/**
 * Data Tools Index
 * Exports all data-related tools for the NHO/NM MCP Server
 */

// Tool definitions (for MCP registration)
export { searchDataTool, executeSearchData } from './search-data.js';
export { previewCountTool, executePreviewCount } from './preview-count.js';
export { getSampleDataTool, executeGetSampleData } from './get-sample-data.js';
export { getPricingTool, executeGetPricing } from './get-pricing.js';
export { getFilterOptionsTool, executeGetFilterOptions } from './get-filter-options.js';

/**
 * All data tools for registration
 */
export const dataTools = [
  { name: 'search_data', module: './search-data.js' },
  { name: 'preview_count', module: './preview-count.js' },
  { name: 'get_sample_data', module: './get-sample-data.js' },
  { name: 'get_pricing', module: './get-pricing.js' },
  { name: 'get_filter_options', module: './get-filter-options.js' },
] as const;
