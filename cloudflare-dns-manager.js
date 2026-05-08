#!/usr/bin/env node
// cloudflare-dns-manager.js - API-driven DNS configuration for Cloudflare Pages

const axios = require('axios');

class CloudflareDNSManager {
  constructor(apiToken, accountId) {
    this.apiToken = apiToken;
    this.accountId = accountId;
    this.apiClient = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getZoneId(domain) {
    try {
      const response = await this.apiClient.get(`/zones?name=${domain}`);
      if (response.data.result.length === 0) {
        throw new Error(`Domain ${domain} not found in Cloudflare zones`);
      }
      return response.data.result[0].id;
    } catch (error) {
      console.error('Error getting zone ID:', error.message);
      throw error;
    }
  }

  async addCNAMERecord(zoneId, name, target, proxied = true) {
    try {
      const record = {
        type: 'CNAME',
        name: name,
        content: target,
        proxied: proxied,
        ttl: 1 // auto
      };

      const response = await this.apiClient.post(`/zones/${zoneId}/dns_records`, record);
      
      if (response.data.success) {
        console.log(`✅ CNAME record added: ${name} → ${target}`);
        return response.data.result;
      } else {
        throw new Error('Failed to add DNS record');
      }
    } catch (error) {
      console.error('Error adding CNAME record:', error.message);
      if (error.response?.data?.errors) {
        console.error('API Errors:', error.response.data.errors);
      }
      throw error;
    }
  }

  async verifyDNSRecord(zoneId, recordType, recordName) {
    try {
      const response = await this.apiClient.get(
        `/zones/${zoneId}/dns_records?type=${recordType}&name=${recordName}`
      );
      
      return response.data.result;
    } catch (error) {
      console.error('Error verifying DNS record:', error.message);
      throw error;
    }
  }

  async configurePagesDNS(domain, pagesProject) {
    console.log(`🚀 Configuring DNS for ${domain} → ${pagesProject}.pages.dev`);
    
    try {
      // 1. Get zone ID
      const zoneId = await this.getZoneId(domain);
      console.log(`📋 Zone ID: ${zoneId}`);

      // 2. Add CNAME record
      const record = await this.addCNAMERecord(zoneId, '@', `${pagesProject}.pages.dev`);
      
      // 3. Verify record
      const records = await this.verifyDNSRecord(zoneId, 'CNAME', '@');
      console.log(`✅ DNS verification: ${records.length} CNAME records found`);
      
      return {
        success: true,
        zoneId,
        record,
        verified: records.length > 0
      };
      
    } catch (error) {
      console.error('❌ DNS configuration failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Usage example
async function main() {
  // Replace with your actual API token and account ID
  const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'your-api-token-here';
  const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'your-account-id';
  
  const manager = new CloudflareDNSManager(API_TOKEN, ACCOUNT_ID);
  
  // Configure DNS for renoisethemes.com
  const result = await manager.configurePagesDNS(
    'renoisethemes.com',
    'renoisethemes'
  );
  
  if (result.success) {
    console.log('🎉 DNS configuration completed successfully!');
    console.log('⏰ Allow 5-30 minutes for DNS propagation and SSL provisioning');
    console.log('🌐 Site will be available at: https://renoisethemes.com');
  } else {
    console.error('❌ Configuration failed');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = CloudflareDNSManager;