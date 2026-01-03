// ====================================================================
// METRICAS SIMPLES EM MEMORIA
// ====================================================================

class Metrics {
  constructor() {
    this.stats = {
      totalRequests: 0,
      totalErrors: 0,
      totalRAGSearches: 0,
      totalRAGHits: 0,
      totalRAGMisses: 0,
      averageResponseTime: 0,
      lastReset: new Date()
    };
    this.responseTimes = [];
  }

  incrementRequests() {
    this.stats.totalRequests++;
  }

  incrementErrors() {
    this.stats.totalErrors++;
  }

  recordRAGSearch(documentsFound) {
    this.stats.totalRAGSearches++;
    if (documentsFound > 0) {
      this.stats.totalRAGHits++;
    } else {
      this.stats.totalRAGMisses++;
    }
  }

  recordResponseTime(ms) {
    this.responseTimes.push(ms);
    
    // Manter apenas ultimas 1000 medicoes
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift();
    }
    
    // Calcular media
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    this.stats.averageResponseTime = Math.round(sum / this.responseTimes.length);
  }

  getStats() {
    return {
      ...this.stats,
      ragHitRate: this.stats.totalRAGSearches > 0
        ? ((this.stats.totalRAGHits / this.stats.totalRAGSearches) * 100).toFixed(1) + '%'
        : 'N/A',
      errorRate: this.stats.totalRequests > 0
        ? ((this.stats.totalErrors / this.stats.totalRequests) * 100).toFixed(1) + '%'
        : 'N/A',
      uptime: Math.floor((Date.now() - this.stats.lastReset.getTime()) / 1000) + 's'
    };
  }

  reset() {
    this.stats = {
      totalRequests: 0,
      totalErrors: 0,
      totalRAGSearches: 0,
      totalRAGHits: 0,
      totalRAGMisses: 0,
      averageResponseTime: 0,
      lastReset: new Date()
    };
    this.responseTimes = [];
  }
}

export const metrics = new Metrics();
export default metrics;
