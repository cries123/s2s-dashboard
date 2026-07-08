export interface PbsPartnerHubConfig {
  baseUrl: string;
  username: string;
  password: string;
  serialNumber: string;
}

function hasValue(value: string | undefined): value is string {
  return !!(value && value.trim() && !value.includes('YOUR_'));
}

export function getPbsPartnerHubConfig(): PbsPartnerHubConfig | null {
  const username = process.env.PBS_PARTNER_USERNAME?.trim();
  const password = process.env.PBS_PARTNER_PASSWORD?.trim();
  const serialNumber =
    process.env.PBS_SERIAL_NUMBER?.trim() ||
    process.env.PBS_API_ACCESS_CODE?.trim() ||
    '8200';

  if (!hasValue(username) || !hasValue(password) || !hasValue(serialNumber)) {
    return null;
  }

  return {
    baseUrl: (process.env.PBS_API_BASE_URL || 'https://partnerhub.pbsdealers.com').replace(/\/$/, ''),
    username,
    password,
    serialNumber,
  };
}

export function isPbsPartnerHubConfigured(): boolean {
  return getPbsPartnerHubConfig() !== null;
}

/** Safe summary for /api/pbs/config — never returns secrets. */
export function getPbsPartnerHubPublicStatus() {
  const config = getPbsPartnerHubConfig();
  if (!config) {
    return {
      configured: false,
      storage: 'server' as const,
      serialNumber: null,
      baseUrl: process.env.PBS_API_BASE_URL || 'https://partnerhub.pbsdealers.com',
      hint:
        'Set PBS_PARTNER_USERNAME, PBS_PARTNER_PASSWORD, and PBS_SERIAL_NUMBER (8200) in Netlify env vars.',
    };
  }

  const serial = config.serialNumber;
  const maskedSerial = serial.length <= 2 ? '**' : `${'*'.repeat(Math.max(0, serial.length - 2))}${serial.slice(-2)}`;

  return {
    configured: true,
    storage: 'server' as const,
    serialNumber: maskedSerial,
    baseUrl: config.baseUrl,
    scopes: ['Service', 'Contact', 'Vehicle'],
    dealership: 'Hyundai of Santa Maria',
  };
}
