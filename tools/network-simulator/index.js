console.log('[Network Simulator] Network Condition Injector Active');

export class NetworkSimulator {
  constructor(options = {}) {
    this.latencyMs = options.latencyMs || 0;
    this.jitterMs = options.jitterMs || 0;
    this.packetLossPercent = options.packetLossPercent || 0;
  }

  shouldDropPacket() {
    if (this.packetLossPercent <= 0) return false;
    return Math.random() * 100 < this.packetLossPercent;
  }

  getSimulatedDelay() {
    if (this.latencyMs <= 0) return 0;
    const jitter = (Math.random() - 0.5) * 2 * this.jitterMs;
    return Math.max(0, this.latencyMs + jitter);
  }

  simulateTransmission(sendCallback) {
    if (this.shouldDropPacket()) {
      return; // Dropped packet
    }

    const delay = this.getSimulatedDelay();
    if (delay === 0) {
      sendCallback();
    } else {
      setTimeout(sendCallback, delay);
    }
  }
}
