// Message Model/Schema
class Message {
  constructor(data) {
    this.from = data.from;
    this.messageId = data.messageId;
    this.messageBody = data.messageBody;
    this.messageType = data.messageType;
    this.receivedAt = data.receivedAt || new Date().toISOString();
  }

  toJSON() {
    return {
      from: this.from,
      messageId: this.messageId,
      messageBody: this.messageBody,
      messageType: this.messageType,
      receivedAt: this.receivedAt
    };
  }
}

module.exports = Message;
