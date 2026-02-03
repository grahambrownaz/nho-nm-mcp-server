/**
 * Template Tools Index
 * Exports all template-related tools for MCP server registration
 */

export {
  uploadTemplateTool,
  executeUploadTemplate,
  type UploadTemplateInput,
} from './upload-template.js';

export {
  browseTemplatesTool,
  executeBrowseTemplates,
  type BrowseTemplatesInput,
} from './browse-templates.js';

export {
  importDesignTool,
  executeImportDesign,
  type ImportDesignInput,
} from './import-design.js';

export {
  generatePostcardPdfTool,
  executeGeneratePostcardPdf,
  type GeneratePostcardPdfInput,
} from './generate-postcard-pdf.js';
