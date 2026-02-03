/**
 * Starter Postcard Templates
 * Pre-built templates for common industries using NHO/NM data
 */

export interface StarterTemplate {
  name: string;
  description: string;
  category: 'REALTOR' | 'HVAC' | 'INSURANCE' | 'LANDSCAPING' | 'HOME_SERVICES' | 'RETAIL' | 'GENERAL';
  size: 'SIZE_4X6' | 'SIZE_6X9' | 'SIZE_6X11';
  htmlFront: string;
  htmlBack: string;
  cssStyles: string;
  mergeFields: string[];
}

/**
 * Common CSS used across templates
 */
const COMMON_CSS = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.4;
  }
  .postcard {
    width: 100%;
    height: 100%;
    padding: 0.25in;
    position: relative;
    overflow: hidden;
  }
  .headline {
    font-weight: bold;
    color: #333;
  }
  .subheadline {
    color: #666;
  }
  .cta-button {
    display: inline-block;
    padding: 8px 20px;
    border-radius: 4px;
    text-decoration: none;
    font-weight: bold;
  }
  .address-block {
    font-size: 11pt;
    line-height: 1.5;
  }
`;

/**
 * Template 1: Realtor - New Homeowner Welcome
 */
const realtorWelcome: StarterTemplate = {
  name: 'New Homeowner Welcome - Realtor',
  description: 'Welcome new homeowners to the neighborhood with a friendly introduction from a local realtor',
  category: 'REALTOR',
  size: 'SIZE_6X9',
  htmlFront: `
    <div class="postcard realtor-front">
      <div class="header-bar"></div>
      <div class="content">
        <h1 class="headline">Welcome to the Neighborhood!</h1>
        <p class="greeting">Dear {{first_name}},</p>
        <p class="message">Congratulations on your new home at {{address}}! As your local real estate expert, I wanted to be the first to welcome you to our wonderful community.</p>
        <div class="agent-info">
          <div class="agent-name">Your Neighbor & Realtor</div>
          <div class="agent-phone">Call/Text: {{agent_phone}}</div>
        </div>
      </div>
      <div class="footer-accent"></div>
    </div>
  `,
  htmlBack: `
    <div class="postcard realtor-back">
      <div class="mailing-area">
        <div class="return-address">
          <strong>{{company_name}}</strong><br>
          {{return_address}}<br>
          {{return_city}}, {{return_state}} {{return_zip}}
        </div>
        <div class="recipient-address address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
        <div class="postage-area">
          <div class="postage-placeholder">POSTAGE</div>
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .realtor-front {
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    }
    .realtor-front .header-bar {
      height: 12px;
      background: linear-gradient(90deg, #2563eb, #1d4ed8);
      margin: -0.25in -0.25in 20px -0.25in;
      width: calc(100% + 0.5in);
    }
    .realtor-front .headline {
      font-size: 28pt;
      color: #1d4ed8;
      margin-bottom: 15px;
    }
    .realtor-front .greeting {
      font-size: 14pt;
      margin-bottom: 10px;
    }
    .realtor-front .message {
      font-size: 12pt;
      color: #4b5563;
      margin-bottom: 20px;
    }
    .realtor-front .agent-info {
      background: #1d4ed8;
      color: white;
      padding: 15px;
      border-radius: 8px;
      display: inline-block;
    }
    .realtor-front .agent-name {
      font-size: 14pt;
      font-weight: bold;
    }
    .realtor-front .agent-phone {
      font-size: 12pt;
    }
    .realtor-back {
      background: white;
    }
    .mailing-area {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto 1fr;
      height: 100%;
      gap: 20px;
    }
    .return-address {
      font-size: 9pt;
      color: #666;
    }
    .recipient-address {
      grid-column: 2;
      grid-row: 2;
      align-self: center;
    }
    .postage-area {
      grid-column: 2;
      grid-row: 1;
      text-align: right;
    }
    .postage-placeholder {
      border: 1px dashed #ccc;
      padding: 10px 20px;
      display: inline-block;
      font-size: 9pt;
      color: #999;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'agent_phone', 'company_name', 'return_address', 'return_city', 'return_state', 'return_zip'],
};

/**
 * Template 2: HVAC - Seasonal Checkup
 */
const hvacCheckup: StarterTemplate = {
  name: 'HVAC Seasonal Checkup',
  description: 'Promote seasonal HVAC maintenance services to new homeowners',
  category: 'HVAC',
  size: 'SIZE_4X6',
  htmlFront: `
    <div class="postcard hvac-front">
      <div class="icon-circle">❄️</div>
      <h1 class="headline">New Home? New HVAC Care!</h1>
      <p class="subheadline">Welcome to {{city}}, {{first_name}}!</p>
      <div class="offer-box">
        <div class="offer-text">$49 TUNE-UP</div>
        <div class="offer-detail">First-time customer special</div>
      </div>
      <p class="cta-text">Call Now: {{phone}}</p>
    </div>
  `,
  htmlBack: `
    <div class="postcard hvac-back">
      <div class="benefits">
        <h3>What's Included:</h3>
        <ul>
          <li>✓ Full system inspection</li>
          <li>✓ Filter replacement</li>
          <li>✓ Efficiency check</li>
          <li>✓ Safety inspection</li>
        </ul>
      </div>
      <div class="address-section">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .hvac-front {
      background: linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%);
      color: white;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .hvac-front .icon-circle {
      font-size: 40pt;
      margin-bottom: 10px;
    }
    .hvac-front .headline {
      font-size: 20pt;
      color: white;
      margin-bottom: 5px;
    }
    .hvac-front .subheadline {
      font-size: 12pt;
      color: rgba(255,255,255,0.9);
      margin-bottom: 15px;
    }
    .hvac-front .offer-box {
      background: white;
      color: #0284c7;
      padding: 15px 30px;
      border-radius: 10px;
      margin-bottom: 15px;
    }
    .hvac-front .offer-text {
      font-size: 24pt;
      font-weight: bold;
    }
    .hvac-front .offer-detail {
      font-size: 10pt;
    }
    .hvac-front .cta-text {
      font-size: 14pt;
      font-weight: bold;
    }
    .hvac-back {
      background: white;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .hvac-back .benefits {
      padding-right: 20px;
    }
    .hvac-back .benefits h3 {
      color: #0284c7;
      margin-bottom: 10px;
    }
    .hvac-back .benefits ul {
      list-style: none;
      font-size: 10pt;
    }
    .hvac-back .benefits li {
      margin-bottom: 5px;
    }
    .hvac-back .address-section {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'phone'],
};

/**
 * Template 3: Insurance - Home Coverage
 */
const insuranceHome: StarterTemplate = {
  name: 'Home Insurance Welcome',
  description: 'Introduce home insurance services to new homeowners',
  category: 'INSURANCE',
  size: 'SIZE_6X9',
  htmlFront: `
    <div class="postcard insurance-front">
      <div class="shield-icon">🛡️</div>
      <h1 class="headline">Protect Your New Home</h1>
      <p class="subheadline">{{first_name}}, get the coverage your family deserves</p>
      <div class="feature-grid">
        <div class="feature">
          <span class="feature-icon">🏠</span>
          <span>Home</span>
        </div>
        <div class="feature">
          <span class="feature-icon">🚗</span>
          <span>Auto</span>
        </div>
        <div class="feature">
          <span class="feature-icon">☂️</span>
          <span>Umbrella</span>
        </div>
        <div class="feature">
          <span class="feature-icon">💼</span>
          <span>Life</span>
        </div>
      </div>
      <div class="quote-cta">
        <span class="cta-button">FREE QUOTE</span>
        <span class="phone">{{agent_phone}}</span>
      </div>
    </div>
  `,
  htmlBack: `
    <div class="postcard insurance-back">
      <div class="message-area">
        <p>Dear {{first_name}},</p>
        <p>Moving into a new home is exciting! Make sure your investment is properly protected with comprehensive coverage from a local agent who cares.</p>
        <p><strong>Call today for a free, no-obligation quote.</strong></p>
      </div>
      <div class="address-area">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .insurance-front {
      background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
      color: white;
      text-align: center;
    }
    .insurance-front .shield-icon {
      font-size: 48pt;
      margin-bottom: 10px;
    }
    .insurance-front .headline {
      font-size: 26pt;
      color: white;
      margin-bottom: 5px;
    }
    .insurance-front .subheadline {
      color: rgba(255,255,255,0.8);
      font-size: 12pt;
      margin-bottom: 20px;
    }
    .insurance-front .feature-grid {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-bottom: 20px;
    }
    .insurance-front .feature {
      display: flex;
      flex-direction: column;
      align-items: center;
      font-size: 10pt;
    }
    .insurance-front .feature-icon {
      font-size: 24pt;
      margin-bottom: 5px;
    }
    .insurance-front .quote-cta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
    }
    .insurance-front .cta-button {
      background: #f59e0b;
      color: #1e3a5f;
      padding: 10px 25px;
    }
    .insurance-front .phone {
      font-size: 16pt;
      font-weight: bold;
    }
    .insurance-back {
      background: #f8fafc;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .insurance-back .message-area {
      font-size: 11pt;
      color: #475569;
      line-height: 1.6;
    }
    .insurance-back .message-area p {
      margin-bottom: 10px;
    }
    .insurance-back .address-area {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'agent_phone'],
};

/**
 * Template 4: Landscaping - Spring Cleanup
 */
const landscapingSpring: StarterTemplate = {
  name: 'Spring Landscaping Cleanup',
  description: 'Promote spring landscaping services to new homeowners',
  category: 'LANDSCAPING',
  size: 'SIZE_4X6',
  htmlFront: `
    <div class="postcard landscape-front">
      <h1 class="headline">🌷 Welcome Home!</h1>
      <p class="tagline">Let's make your yard the envy of {{city}}</p>
      <div class="service-list">
        <span class="service">Lawn Care</span>
        <span class="service">Mulching</span>
        <span class="service">Planting</span>
      </div>
      <div class="offer">
        <span class="discount">15% OFF</span>
        <span class="offer-text">First Service</span>
      </div>
    </div>
  `,
  htmlBack: `
    <div class="postcard landscape-back">
      <div class="company-info">
        <strong>{{company_name}}</strong><br>
        Local & Family Owned<br>
        {{phone}}
      </div>
      <div class="address-section">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .landscape-front {
      background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);
      color: white;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .landscape-front .headline {
      font-size: 22pt;
      color: white;
      margin-bottom: 5px;
    }
    .landscape-front .tagline {
      font-size: 11pt;
      margin-bottom: 15px;
      opacity: 0.9;
    }
    .landscape-front .service-list {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }
    .landscape-front .service {
      background: rgba(255,255,255,0.2);
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 10pt;
    }
    .landscape-front .offer {
      background: white;
      color: #16a34a;
      padding: 10px 25px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .landscape-front .discount {
      font-size: 20pt;
      font-weight: bold;
    }
    .landscape-front .offer-text {
      font-size: 10pt;
    }
    .landscape-back {
      background: white;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .landscape-back .company-info {
      font-size: 10pt;
      color: #16a34a;
    }
    .landscape-back .address-section {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'phone', 'company_name'],
};

/**
 * Template 5: Plumber - New Homeowner Special
 */
const plumberWelcome: StarterTemplate = {
  name: 'Plumber New Homeowner',
  description: 'Introduce plumbing services to new homeowners',
  category: 'HOME_SERVICES',
  size: 'SIZE_4X6',
  htmlFront: `
    <div class="postcard plumber-front">
      <div class="badge">NEW HOMEOWNER SPECIAL</div>
      <h1 class="headline">🔧 Know Your Plumber!</h1>
      <p class="subtext">{{first_name}}, save this card for emergencies</p>
      <div class="services">
        <span>Leaks</span> • <span>Drains</span> • <span>Water Heaters</span>
      </div>
      <div class="phone-box">
        <div class="availability">24/7 Emergency Service</div>
        <div class="phone-number">{{phone}}</div>
      </div>
    </div>
  `,
  htmlBack: `
    <div class="postcard plumber-back">
      <div class="coupon">
        <div class="coupon-value">$25 OFF</div>
        <div class="coupon-text">Any Service Over $100</div>
        <div class="coupon-code">Code: WELCOME</div>
      </div>
      <div class="address-section">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .plumber-front {
      background: #1e40af;
      color: white;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .plumber-front .badge {
      background: #fbbf24;
      color: #1e40af;
      padding: 5px 15px;
      border-radius: 20px;
      font-size: 9pt;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .plumber-front .headline {
      font-size: 20pt;
      color: white;
      margin-bottom: 5px;
    }
    .plumber-front .subtext {
      font-size: 11pt;
      opacity: 0.9;
      margin-bottom: 10px;
    }
    .plumber-front .services {
      font-size: 10pt;
      margin-bottom: 15px;
      opacity: 0.8;
    }
    .plumber-front .phone-box {
      background: white;
      color: #1e40af;
      padding: 12px 25px;
      border-radius: 8px;
    }
    .plumber-front .availability {
      font-size: 9pt;
      color: #dc2626;
      font-weight: bold;
    }
    .plumber-front .phone-number {
      font-size: 18pt;
      font-weight: bold;
    }
    .plumber-back {
      background: white;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .plumber-back .coupon {
      border: 2px dashed #1e40af;
      padding: 15px;
      text-align: center;
      border-radius: 8px;
    }
    .plumber-back .coupon-value {
      font-size: 20pt;
      font-weight: bold;
      color: #1e40af;
    }
    .plumber-back .coupon-text {
      font-size: 10pt;
      color: #666;
    }
    .plumber-back .coupon-code {
      font-size: 9pt;
      color: #999;
      margin-top: 5px;
    }
    .plumber-back .address-section {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'phone'],
};

/**
 * Template 6: Cleaning Service
 */
const cleaningService: StarterTemplate = {
  name: 'Move-In Cleaning Special',
  description: 'Offer move-in cleaning services to new homeowners',
  category: 'HOME_SERVICES',
  size: 'SIZE_4X6',
  htmlFront: `
    <div class="postcard cleaning-front">
      <h1 class="headline">✨ Start Fresh!</h1>
      <p class="subheadline">Move-In Deep Cleaning</p>
      <p class="personalized">Welcome to {{address}}, {{first_name}}!</p>
      <div class="offer-circle">
        <div class="offer-amount">20% OFF</div>
        <div class="offer-label">First Clean</div>
      </div>
    </div>
  `,
  htmlBack: `
    <div class="postcard cleaning-back">
      <div class="info-section">
        <h3>Move-In Clean Includes:</h3>
        <ul>
          <li>✓ Kitchen deep clean</li>
          <li>✓ Bathroom sanitization</li>
          <li>✓ All floors & baseboards</li>
          <li>✓ Inside cabinets</li>
        </ul>
        <p class="contact">Book: {{phone}}</p>
      </div>
      <div class="address-section">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .cleaning-front {
      background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
      color: white;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .cleaning-front .headline {
      font-size: 24pt;
      color: white;
      margin-bottom: 0;
    }
    .cleaning-front .subheadline {
      font-size: 14pt;
      margin-bottom: 10px;
      opacity: 0.9;
    }
    .cleaning-front .personalized {
      font-size: 10pt;
      margin-bottom: 15px;
      opacity: 0.8;
    }
    .cleaning-front .offer-circle {
      background: white;
      color: #6d28d9;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .cleaning-front .offer-amount {
      font-size: 18pt;
      font-weight: bold;
    }
    .cleaning-front .offer-label {
      font-size: 9pt;
    }
    .cleaning-back {
      background: white;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .cleaning-back .info-section {
      font-size: 10pt;
    }
    .cleaning-back .info-section h3 {
      color: #6d28d9;
      font-size: 11pt;
      margin-bottom: 8px;
    }
    .cleaning-back .info-section ul {
      list-style: none;
      margin-bottom: 10px;
    }
    .cleaning-back .info-section li {
      margin-bottom: 3px;
    }
    .cleaning-back .contact {
      font-weight: bold;
      color: #6d28d9;
    }
    .cleaning-back .address-section {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'phone'],
};

/**
 * Template 7: Pest Control
 */
const pestControl: StarterTemplate = {
  name: 'Pest Control New Home',
  description: 'Promote pest prevention to new homeowners',
  category: 'HOME_SERVICES',
  size: 'SIZE_4X6',
  htmlFront: `
    <div class="postcard pest-front">
      <div class="bug-icon">🐜</div>
      <h1 class="headline">Don't Share Your New Home!</h1>
      <p class="subtext">Keep pests out from day one</p>
      <div class="offer-banner">
        <span class="offer-text">FREE INSPECTION</span>
        <span class="offer-sub">+ $50 off first treatment</span>
      </div>
      <p class="phone">{{phone}}</p>
    </div>
  `,
  htmlBack: `
    <div class="postcard pest-back">
      <div class="protection-list">
        <h4>We Protect Against:</h4>
        <div class="pests">
          <span>🐜 Ants</span>
          <span>🕷️ Spiders</span>
          <span>🪳 Roaches</span>
          <span>🐀 Rodents</span>
        </div>
      </div>
      <div class="address-section">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .pest-front {
      background: #059669;
      color: white;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .pest-front .bug-icon {
      font-size: 36pt;
      margin-bottom: 5px;
    }
    .pest-front .headline {
      font-size: 18pt;
      color: white;
      margin-bottom: 5px;
    }
    .pest-front .subtext {
      font-size: 11pt;
      opacity: 0.9;
      margin-bottom: 15px;
    }
    .pest-front .offer-banner {
      background: white;
      color: #059669;
      padding: 10px 20px;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .pest-front .offer-text {
      font-size: 16pt;
      font-weight: bold;
      display: block;
    }
    .pest-front .offer-sub {
      font-size: 10pt;
    }
    .pest-front .phone {
      font-size: 16pt;
      font-weight: bold;
    }
    .pest-back {
      background: white;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .pest-back .protection-list h4 {
      color: #059669;
      font-size: 11pt;
      margin-bottom: 10px;
    }
    .pest-back .pests {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      font-size: 10pt;
    }
    .pest-back .address-section {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'phone'],
};

/**
 * Template 8: Local Restaurant
 */
const restaurantWelcome: StarterTemplate = {
  name: 'Local Restaurant Welcome',
  description: 'Welcome new residents with a dining offer',
  category: 'RETAIL',
  size: 'SIZE_4X6',
  htmlFront: `
    <div class="postcard restaurant-front">
      <h1 class="headline">🍽️ Welcome to {{city}}!</h1>
      <p class="intro">{{first_name}}, discover your new favorite spot</p>
      <div class="offer-box">
        <div class="offer-value">FREE APPETIZER</div>
        <div class="offer-detail">with any entrée purchase</div>
      </div>
      <p class="tagline">Fresh • Local • Delicious</p>
    </div>
  `,
  htmlBack: `
    <div class="postcard restaurant-back">
      <div class="restaurant-info">
        <strong>{{company_name}}</strong><br>
        {{restaurant_address}}<br>
        <br>
        <strong>Hours:</strong><br>
        Mon-Sat: 11am-10pm<br>
        Sun: 12pm-9pm<br>
        <br>
        <strong>Reserve:</strong> {{phone}}
      </div>
      <div class="address-section">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .restaurant-front {
      background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
      color: white;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .restaurant-front .headline {
      font-size: 20pt;
      color: white;
      margin-bottom: 5px;
    }
    .restaurant-front .intro {
      font-size: 11pt;
      opacity: 0.9;
      margin-bottom: 15px;
    }
    .restaurant-front .offer-box {
      background: white;
      color: #dc2626;
      padding: 15px 25px;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .restaurant-front .offer-value {
      font-size: 18pt;
      font-weight: bold;
    }
    .restaurant-front .offer-detail {
      font-size: 10pt;
    }
    .restaurant-front .tagline {
      font-size: 11pt;
      font-style: italic;
      opacity: 0.8;
    }
    .restaurant-back {
      background: white;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .restaurant-back .restaurant-info {
      font-size: 10pt;
      color: #333;
    }
    .restaurant-back .address-section {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'phone', 'company_name', 'restaurant_address'],
};

/**
 * Template 9: Gym/Fitness
 */
const gymWelcome: StarterTemplate = {
  name: 'Fitness Center Welcome',
  description: 'Promote gym membership to new residents',
  category: 'RETAIL',
  size: 'SIZE_4X6',
  htmlFront: `
    <div class="postcard gym-front">
      <h1 class="headline">💪 New to {{city}}?</h1>
      <p class="subtext">Find Your Fitness Home</p>
      <div class="offer-box">
        <div class="offer-main">FREE WEEK</div>
        <div class="offer-plus">+ No Enrollment Fee</div>
      </div>
      <p class="cta">Join {{first_name}}'s neighbors who train with us!</p>
    </div>
  `,
  htmlBack: `
    <div class="postcard gym-back">
      <div class="amenities">
        <h4>Amenities:</h4>
        <ul>
          <li>✓ State-of-art equipment</li>
          <li>✓ Group fitness classes</li>
          <li>✓ Personal training</li>
          <li>✓ Locker rooms & showers</li>
        </ul>
        <p>{{phone}}</p>
      </div>
      <div class="address-section">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .gym-front {
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      color: white;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .gym-front .headline {
      font-size: 22pt;
      color: white;
      margin-bottom: 0;
    }
    .gym-front .subtext {
      font-size: 12pt;
      margin-bottom: 15px;
      opacity: 0.9;
    }
    .gym-front .offer-box {
      background: white;
      color: #ea580c;
      padding: 15px 30px;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .gym-front .offer-main {
      font-size: 22pt;
      font-weight: bold;
    }
    .gym-front .offer-plus {
      font-size: 10pt;
    }
    .gym-front .cta {
      font-size: 10pt;
      opacity: 0.9;
    }
    .gym-back {
      background: white;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .gym-back .amenities h4 {
      color: #ea580c;
      font-size: 11pt;
      margin-bottom: 8px;
    }
    .gym-back .amenities ul {
      list-style: none;
      font-size: 9pt;
      margin-bottom: 10px;
    }
    .gym-back .amenities li {
      margin-bottom: 3px;
    }
    .gym-back .amenities p {
      font-weight: bold;
      color: #ea580c;
    }
    .gym-back .address-section {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'phone'],
};

/**
 * Template 10: General Welcome
 */
const generalWelcome: StarterTemplate = {
  name: 'General Business Welcome',
  description: 'Generic welcome postcard for any business type',
  category: 'GENERAL',
  size: 'SIZE_4X6',
  htmlFront: `
    <div class="postcard general-front">
      <h1 class="headline">Welcome, {{first_name}}!</h1>
      <p class="subheadline">We're thrilled you chose {{city}}</p>
      <div class="message">
        <p>As your new neighbor, we'd love to meet you and offer our services.</p>
      </div>
      <div class="cta-box">
        <span class="cta-text">{{offer_text}}</span>
      </div>
    </div>
  `,
  htmlBack: `
    <div class="postcard general-back">
      <div class="business-info">
        <strong>{{company_name}}</strong><br>
        {{business_address}}<br>
        {{phone}}<br>
        {{website}}
      </div>
      <div class="address-section">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .general-front {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .general-front .headline {
      font-size: 22pt;
      color: white;
      margin-bottom: 5px;
    }
    .general-front .subheadline {
      font-size: 12pt;
      opacity: 0.9;
      margin-bottom: 15px;
    }
    .general-front .message {
      font-size: 11pt;
      max-width: 80%;
      margin-bottom: 15px;
      opacity: 0.95;
    }
    .general-front .cta-box {
      background: white;
      color: #1d4ed8;
      padding: 12px 25px;
      border-radius: 8px;
    }
    .general-front .cta-text {
      font-size: 14pt;
      font-weight: bold;
    }
    .general-back {
      background: white;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .general-back .business-info {
      font-size: 10pt;
      color: #333;
    }
    .general-back .address-section {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'phone', 'company_name', 'business_address', 'website', 'offer_text'],
};

/**
 * Template 11: Mortgage/Refinance
 */
const mortgageRefinance: StarterTemplate = {
  name: 'Mortgage Refinance',
  description: 'Offer refinance services to new homeowners',
  category: 'INSURANCE',
  size: 'SIZE_6X9',
  htmlFront: `
    <div class="postcard mortgage-front">
      <div class="rate-badge">RATES FROM 5.99%*</div>
      <h1 class="headline">Loving Your New Home?</h1>
      <p class="subtext">{{first_name}}, let's make sure you have the best rate.</p>
      <div class="benefits">
        <span class="benefit">✓ Lower payments</span>
        <span class="benefit">✓ Cash out equity</span>
        <span class="benefit">✓ No cost refinance options</span>
      </div>
      <div class="cta">
        <span class="cta-button">FREE RATE CHECK</span>
        <span class="phone">{{phone}}</span>
      </div>
    </div>
  `,
  htmlBack: `
    <div class="postcard mortgage-back">
      <div class="info-area">
        <p>Dear {{first_name}},</p>
        <p>Congratulations on your new home at {{address}}! With current market conditions, now may be the perfect time to review your mortgage options.</p>
        <p>Our local lending experts can help you:</p>
        <ul>
          <li>Review your current rate</li>
          <li>Explore refinance savings</li>
          <li>Access your home's equity</li>
        </ul>
        <p><em>*APR varies. Subject to approval.</em></p>
      </div>
      <div class="address-area">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .mortgage-front {
      background: linear-gradient(135deg, #065f46 0%, #064e3b 100%);
      color: white;
      text-align: center;
    }
    .mortgage-front .rate-badge {
      background: #fbbf24;
      color: #064e3b;
      padding: 8px 20px;
      border-radius: 20px;
      font-size: 12pt;
      font-weight: bold;
      display: inline-block;
      margin-bottom: 15px;
    }
    .mortgage-front .headline {
      font-size: 28pt;
      color: white;
      margin-bottom: 10px;
    }
    .mortgage-front .subtext {
      font-size: 14pt;
      opacity: 0.9;
      margin-bottom: 20px;
    }
    .mortgage-front .benefits {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-bottom: 25px;
    }
    .mortgage-front .benefit {
      font-size: 11pt;
    }
    .mortgage-front .cta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }
    .mortgage-front .cta-button {
      background: #fbbf24;
      color: #064e3b;
      padding: 12px 30px;
      border-radius: 8px;
    }
    .mortgage-front .phone {
      font-size: 18pt;
      font-weight: bold;
    }
    .mortgage-back {
      background: #f0fdf4;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .mortgage-back .info-area {
      font-size: 10pt;
      color: #374151;
      line-height: 1.5;
    }
    .mortgage-back .info-area p {
      margin-bottom: 8px;
    }
    .mortgage-back .info-area ul {
      margin: 8px 0 8px 15px;
    }
    .mortgage-back .info-area li {
      margin-bottom: 3px;
    }
    .mortgage-back .address-area {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'phone'],
};

/**
 * Template 12: Moving Services
 */
const movingServices: StarterTemplate = {
  name: 'Moving & Storage',
  description: 'Offer moving and storage services to new movers',
  category: 'HOME_SERVICES',
  size: 'SIZE_4X6',
  htmlFront: `
    <div class="postcard moving-front">
      <div class="truck-icon">🚚</div>
      <h1 class="headline">Still Unpacking?</h1>
      <p class="subtext">We can help, {{first_name}}!</p>
      <div class="services-row">
        <span>Unpacking</span> • <span>Storage</span> • <span>Organizing</span>
      </div>
      <div class="offer">
        <span class="offer-amount">2 HOURS FREE</span>
        <span class="offer-detail">with any 4+ hour booking</span>
      </div>
    </div>
  `,
  htmlBack: `
    <div class="postcard moving-back">
      <div class="company-details">
        <strong>{{company_name}}</strong><br>
        Licensed & Insured<br>
        <br>
        <strong>Services:</strong><br>
        • Professional packing<br>
        • Climate-controlled storage<br>
        • Assembly & installation<br>
        <br>
        <strong>Book:</strong> {{phone}}
      </div>
      <div class="address-section">
        <div class="recipient address-block">
          {{first_name}} {{last_name}}<br>
          {{address}}<br>
          {{city}}, {{state}} {{zip}}
        </div>
      </div>
    </div>
  `,
  cssStyles: COMMON_CSS + `
    .moving-front {
      background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
      color: white;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .moving-front .truck-icon {
      font-size: 36pt;
      margin-bottom: 5px;
    }
    .moving-front .headline {
      font-size: 20pt;
      color: white;
      margin-bottom: 0;
    }
    .moving-front .subtext {
      font-size: 12pt;
      opacity: 0.9;
      margin-bottom: 10px;
    }
    .moving-front .services-row {
      font-size: 10pt;
      margin-bottom: 15px;
      opacity: 0.85;
    }
    .moving-front .offer {
      background: white;
      color: #5b21b6;
      padding: 12px 25px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .moving-front .offer-amount {
      font-size: 18pt;
      font-weight: bold;
    }
    .moving-front .offer-detail {
      font-size: 9pt;
    }
    .moving-back {
      background: white;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .moving-back .company-details {
      font-size: 9pt;
      color: #333;
    }
    .moving-back .address-section {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  mergeFields: ['first_name', 'last_name', 'address', 'city', 'state', 'zip', 'phone', 'company_name'],
};

/**
 * Export all starter templates
 */
export const starterTemplates: StarterTemplate[] = [
  realtorWelcome,
  hvacCheckup,
  insuranceHome,
  landscapingSpring,
  plumberWelcome,
  cleaningService,
  pestControl,
  restaurantWelcome,
  gymWelcome,
  generalWelcome,
  mortgageRefinance,
  movingServices,
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): StarterTemplate[] {
  if (category === 'all') return starterTemplates;
  return starterTemplates.filter((t) => t.category === category.toUpperCase());
}

/**
 * Get template by name
 */
export function getTemplateByName(name: string): StarterTemplate | undefined {
  return starterTemplates.find((t) => t.name === name);
}
