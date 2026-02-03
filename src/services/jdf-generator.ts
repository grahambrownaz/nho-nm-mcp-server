/**
 * JDF Job Ticket Generator
 * Generates JDF 1.5 XML job tickets for print fulfillment
 */

/**
 * JDF preset configurations
 */
export interface JdfPreset {
  name: string;
  description: string;
  media: {
    type: string;
    weight: number; // gsm
    coating: string;
    colorType: string;
  };
  dimensions: {
    width: number; // inches
    height: number; // inches
  };
  finishing?: {
    type: string;
    details?: string;
  };
}

/**
 * Available JDF presets
 */
export const JDF_PRESETS: Record<string, JdfPreset> = {
  '4x6_100lb_gloss_fc': {
    name: '4x6 100lb Gloss Full Color',
    description: '4x6 postcard on 100lb gloss stock, full color both sides',
    media: {
      type: 'Paper',
      weight: 148, // 100lb = ~148 gsm
      coating: 'Glossy',
      colorType: 'FullColor',
    },
    dimensions: {
      width: 6,
      height: 4,
    },
  },
  '4x6_100lb_matte_fc': {
    name: '4x6 100lb Matte Full Color',
    description: '4x6 postcard on 100lb matte stock, full color both sides',
    media: {
      type: 'Paper',
      weight: 148,
      coating: 'Matte',
      colorType: 'FullColor',
    },
    dimensions: {
      width: 6,
      height: 4,
    },
  },
  '6x9_100lb_gloss_fc': {
    name: '6x9 100lb Gloss Full Color',
    description: '6x9 postcard on 100lb gloss stock, full color both sides',
    media: {
      type: 'Paper',
      weight: 148,
      coating: 'Glossy',
      colorType: 'FullColor',
    },
    dimensions: {
      width: 9,
      height: 6,
    },
  },
  '6x9_100lb_matte_fc': {
    name: '6x9 100lb Matte Full Color',
    description: '6x9 postcard on 100lb matte stock, full color both sides',
    media: {
      type: 'Paper',
      weight: 148,
      coating: 'Matte',
      colorType: 'FullColor',
    },
    dimensions: {
      width: 9,
      height: 6,
    },
  },
  '6x11_120lb_gloss_fc': {
    name: '6x11 120lb Gloss Full Color',
    description: '6x11 postcard on 120lb gloss stock, full color both sides',
    media: {
      type: 'Paper',
      weight: 176, // 120lb = ~176 gsm
      coating: 'Glossy',
      colorType: 'FullColor',
    },
    dimensions: {
      width: 11,
      height: 6,
    },
  },
  '6x11_120lb_matte_fc': {
    name: '6x11 120lb Matte Full Color',
    description: '6x11 postcard on 120lb matte stock, full color both sides',
    media: {
      type: 'Paper',
      weight: 176,
      coating: 'Matte',
      colorType: 'FullColor',
    },
    dimensions: {
      width: 11,
      height: 6,
    },
  },
};

/**
 * JDF generation options
 */
export interface JdfGenerationOptions {
  jobId: string;
  jobName: string;
  quantity: number;
  preset: string;
  pdfFileName: string;
  customerName?: string;
  deliveryDate?: Date;
  priority?: 'low' | 'normal' | 'high' | 'rush';
  notes?: string;
}

/**
 * JDF generation result
 */
export interface JdfGenerationResult {
  success: boolean;
  xml: string;
  jobId: string;
  preset: JdfPreset;
  error?: string;
}

/**
 * XML escape utility
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format date for JDF
 */
function formatJdfDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * JDF Generator class
 */
export class JdfGenerator {
  /**
   * Get available presets
   */
  getPresets(): Record<string, JdfPreset> {
    return JDF_PRESETS;
  }

  /**
   * Get a specific preset
   */
  getPreset(presetName: string): JdfPreset | null {
    return JDF_PRESETS[presetName] || null;
  }

  /**
   * Generate JDF 1.5 XML job ticket
   */
  generate(options: JdfGenerationOptions): JdfGenerationResult {
    const preset = JDF_PRESETS[options.preset];

    if (!preset) {
      return {
        success: false,
        xml: '',
        jobId: options.jobId,
        preset: JDF_PRESETS['4x6_100lb_gloss_fc'],
        error: `Unknown preset: ${options.preset}. Available presets: ${Object.keys(JDF_PRESETS).join(', ')}`,
      };
    }

    const now = new Date();
    const jobId = escapeXml(options.jobId);
    const jobName = escapeXml(options.jobName);
    const pdfFileName = escapeXml(options.pdfFileName);
    const customerName = options.customerName ? escapeXml(options.customerName) : '';
    const notes = options.notes ? escapeXml(options.notes) : '';

    // Calculate dimensions with bleed (0.125" on each side)
    const trimWidth = preset.dimensions.width;
    const trimHeight = preset.dimensions.height;
    const bleedWidth = trimWidth + 0.25;
    const bleedHeight = trimHeight + 0.25;

    // Map priority to JDF priority value
    const priorityMap: Record<string, number> = {
      low: 25,
      normal: 50,
      high: 75,
      rush: 100,
    };
    const priority = priorityMap[options.priority || 'normal'];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<JDF xmlns="http://www.CIP4.org/JDFSchema_1_5"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     ID="JOB_${jobId}"
     JobID="${jobName}"
     Type="Product"
     Status="Waiting"
     Version="1.5"
     DescriptiveName="${jobName}"
     JobPartID="${jobId}">

  <!-- Job Header -->
  <AuditPool>
    <Created TimeStamp="${formatJdfDate(now)}" AgentName="NHO-NM-MCP-Server" AgentVersion="1.1.0"/>
  </AuditPool>

  <!-- Customer Information -->
  <CustomerInfo CustomerID="${jobId}_CUST">
    ${customerName ? `<ContactRef rRef="${jobId}_CONTACT"/>` : ''}
  </CustomerInfo>
  ${customerName ? `
  <Contact ID="${jobId}_CONTACT">
    <Company>${customerName}</Company>
  </Contact>` : ''}

  <!-- Job Priority -->
  <NodeInfo>
    <JobPriority Priority="${priority}"/>
    ${options.deliveryDate ? `<DueDate>${formatJdfDate(options.deliveryDate)}</DueDate>` : ''}
    ${notes ? `<Comment>${notes}</Comment>` : ''}
  </NodeInfo>

  <!-- Resource Pool -->
  <ResourcePool>
    <!-- Output Component (Postcards) -->
    <Component ID="${jobId}_POSTCARDS" Class="Quantity" Status="Available"
               ComponentType="FinalProduct" DescriptiveName="Postcards">
      <Dimensions>${trimWidth} ${trimHeight}</Dimensions>
    </Component>

    <!-- Media Specification -->
    <Media ID="${jobId}_MEDIA" Class="Consumable" Status="Available"
           MediaType="${preset.media.type}"
           Weight="${preset.media.weight}"
           Coating="${preset.media.coating}"
           DescriptiveName="${preset.name}">
      <MediaLayers>
        <MediaLayer MediaLayerSide="Front"/>
        <MediaLayer MediaLayerSide="Back"/>
      </MediaLayers>
    </Media>

    <!-- Color Intent -->
    <ColorIntent ID="${jobId}_COLOR" Class="Intent" Status="Available">
      <ColorPool>
        <ColorType Type="${preset.media.colorType}"/>
      </ColorPool>
    </ColorIntent>

    <!-- Layout -->
    <Layout ID="${jobId}_LAYOUT" Class="Parameter" Status="Available">
      <Signature Name="Postcard">
        <Surface Side="Front">
          <ContentObject CTM="1 0 0 1 0 0"/>
        </Surface>
        <Surface Side="Back">
          <ContentObject CTM="1 0 0 1 0 0"/>
        </Surface>
      </Signature>
    </Layout>

    <!-- PDF File Reference -->
    <RunList ID="${jobId}_RUNLIST" Class="Parameter" Status="Available">
      <LayoutElement>
        <FileSpec URL="file://${pdfFileName}" MimeType="application/pdf"/>
      </LayoutElement>
    </RunList>

    <!-- Trim Specification -->
    <CutBlock ID="${jobId}_CUTBLOCK" Class="Parameter" Status="Available">
      <CutBox>
        <Box Bottom="0" Left="0" Top="${trimHeight}" Right="${trimWidth}"/>
      </CutBox>
      <BleedBox>
        <Box Bottom="-0.125" Left="-0.125" Top="${bleedHeight - 0.125}" Right="${bleedWidth - 0.125}"/>
      </BleedBox>
    </CutBlock>

    <!-- Delivery Method -->
    <DeliveryIntent ID="${jobId}_DELIVERY" Class="Intent" Status="Available">
      <DropIntent>
        <Required>
          <Amount>${options.quantity}</Amount>
        </Required>
      </DropIntent>
    </DeliveryIntent>
  </ResourcePool>

  <!-- Resource Links -->
  <ResourceLinkPool>
    <ComponentLink rRef="${jobId}_POSTCARDS" Usage="Output" Amount="${options.quantity}"/>
    <MediaLink rRef="${jobId}_MEDIA" Usage="Input"/>
    <ColorIntentLink rRef="${jobId}_COLOR" Usage="Input"/>
    <LayoutLink rRef="${jobId}_LAYOUT" Usage="Input"/>
    <RunListLink rRef="${jobId}_RUNLIST" Usage="Input"/>
    <CutBlockLink rRef="${jobId}_CUTBLOCK" Usage="Input"/>
    <DeliveryIntentLink rRef="${jobId}_DELIVERY" Usage="Input"/>
  </ResourceLinkPool>

</JDF>`;

    return {
      success: true,
      xml,
      jobId: options.jobId,
      preset,
    };
  }

  /**
   * Generate a simplified JDF for printers that don't support full JDF 1.5
   */
  generateSimplified(options: JdfGenerationOptions): JdfGenerationResult {
    const preset = JDF_PRESETS[options.preset];

    if (!preset) {
      return {
        success: false,
        xml: '',
        jobId: options.jobId,
        preset: JDF_PRESETS['4x6_100lb_gloss_fc'],
        error: `Unknown preset: ${options.preset}`,
      };
    }

    const jobName = escapeXml(options.jobName);
    const pdfFileName = escapeXml(options.pdfFileName);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<JDF xmlns="http://www.CIP4.org/JDFSchema_1_5"
     ID="JOB_${escapeXml(options.jobId)}"
     JobID="${jobName}"
     Type="Product"
     Status="Waiting"
     Version="1.5">
  <ResourcePool>
    <Component ID="Postcards" Class="Quantity" Status="Available">
      <Dimensions>${preset.dimensions.width} ${preset.dimensions.height}</Dimensions>
    </Component>
    <Media ID="Media1" Class="Consumable" Status="Available"
           MediaType="${preset.media.type}" Weight="${preset.media.weight}"
           Coating="${preset.media.coating}" />
    <RunList ID="PDFFiles" Class="Parameter" Status="Available">
      <LayoutElement>
        <FileSpec URL="file://${pdfFileName}"/>
      </LayoutElement>
    </RunList>
  </ResourcePool>
  <ResourceLinkPool>
    <ComponentLink rRef="Postcards" Usage="Output" Amount="${options.quantity}"/>
    <MediaLink rRef="Media1" Usage="Input"/>
    <RunListLink rRef="PDFFiles" Usage="Input"/>
  </ResourceLinkPool>
</JDF>`;

    return {
      success: true,
      xml,
      jobId: options.jobId,
      preset,
    };
  }
}

// Singleton instance
let jdfGeneratorInstance: JdfGenerator | null = null;

/**
 * Get the singleton JDF generator instance
 */
export function getJdfGenerator(): JdfGenerator {
  if (!jdfGeneratorInstance) {
    jdfGeneratorInstance = new JdfGenerator();
  }
  return jdfGeneratorInstance;
}
