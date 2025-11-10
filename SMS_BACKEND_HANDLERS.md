# SMS Backend Handlers - DCA2 Compliance

This document outlines the required SMS message handlers to meet DCA2 compliance requirements for Grasshopper SMS integration.

## Required Message Handlers

### 1. Opt-In Confirmation Message

When a user opts in via the website, you must send a confirmation message that includes ALL of the following:

**Required Elements:**
- Brand name: "Firm Title TB"
- HELP keyword instruction
- Opt-out keyword (STOP) instruction
- Message frequency disclosure
- Associated fees disclosure

**Example Message:**
```
Welcome to Firm Title TB SMS updates! Reply HELP for help, STOP to opt-out. 
You may receive up to 4 messages per month. Message and data rates may apply.
```

### 2. STOP (Opt-Out) Message Handler

When a user sends "STOP" (case-insensitive), you must:

1. Immediately unsubscribe the user
2. Send a confirmation message that includes:
   - Brand name
   - Confirmation that no further messages will be sent

**Example Response:**
```
Firm Title TB: You have been unsubscribed. You will no longer receive messages from us.
```

**Implementation Notes:**
- Must process STOP immediately (within seconds)
- Must not send any further messages after STOP confirmation
- Must log the opt-out for compliance records

### 3. HELP Message Handler

When a user sends "HELP" (case-insensitive), you must send a message that includes:

**Required Elements:**
- Brand name
- Support contact information (email, phone, or website)

**Example Response:**
```
Firm Title TB: For help, contact us at scott@firmtitletb.com or 813-812-4949. 
Reply STOP to opt-out. Message frequency: Up to 4 messages/month. 
Message and data rates may apply.
```

## Implementation Guide

### Grasshopper API Integration

Since you're using Grasshopper, you'll need to:

1. **Set up webhook endpoints** to receive incoming SMS messages
2. **Process incoming messages** to detect STOP and HELP keywords
3. **Send automated responses** using Grasshopper's API

### Example Backend Handler (Node.js/Express)

```javascript
// Example SMS handler endpoint
app.post('/api/sms/webhook', async (req, res) => {
  const { from, body } = req.body; // Incoming message from Grasshopper
  
  const message = body.trim().toUpperCase();
  
  // Handle STOP
  if (message === 'STOP') {
    // Unsubscribe user in database
    await unsubscribeUser(from);
    
    // Send confirmation
    await sendSMS(from, 
      'Firm Title TB: You have been unsubscribed. You will no longer receive messages from us.'
    );
    
    return res.status(200).send('OK');
  }
  
  // Handle HELP
  if (message === 'HELP') {
    await sendSMS(from,
      'Firm Title TB: For help, contact us at scott@firmtitletb.com or 813-812-4949. ' +
      'Reply STOP to opt-out. Message frequency: Up to 4 messages/month. ' +
      'Message and data rates may apply.'
    );
    
    return res.status(200).send('OK');
  }
  
  // Handle other messages (optional)
  res.status(200).send('OK');
});

// Opt-in handler (called from website)
app.post('/api/sms/opt-in', async (req, res) => {
  const { phoneNumber } = req.body;
  
  // Validate phone number
  if (!isValidPhoneNumber(phoneNumber)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }
  
  // Add to database
  await subscribeUser(phoneNumber);
  
  // Send confirmation message with all required elements
  await sendSMS(phoneNumber,
    'Welcome to Firm Title TB SMS updates! Reply HELP for help, STOP to opt-out. ' +
    'You may receive up to 4 messages per month. Message and data rates may apply.'
  );
  
  res.json({ success: true });
});
```

### Database Schema

You'll need to track:

```sql
CREATE TABLE sms_subscribers (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  subscribed BOOLEAN DEFAULT true,
  subscribed_at TIMESTAMP DEFAULT NOW(),
  unsubscribed_at TIMESTAMP,
  opt_in_source VARCHAR(50), -- 'website', 'text', etc.
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Key Compliance Requirements

1. **Immediate Processing**: STOP and HELP must be processed within seconds
2. **No Further Messages**: After STOP confirmation, never send another message
3. **Complete Disclosures**: All messages must include required elements
4. **Logging**: Maintain records of all opt-ins, opt-outs, and messages sent
5. **Consent**: Only send messages to users who have explicitly opted in

## Testing Checklist

- [ ] Opt-in confirmation message includes all required elements
- [ ] STOP message immediately unsubscribes user
- [ ] STOP confirmation includes brand name and no-further-messages statement
- [ ] HELP message includes brand name and support contact
- [ ] No messages sent after STOP confirmation
- [ ] All messages include required disclosures
- [ ] Phone number validation works correctly
- [ ] Database properly tracks subscriptions

## Contact Information for Messages

- **Brand Name**: Firm Title TB
- **Support Email**: scott@firmtitletb.com
- **Support Phone**: 813-812-4949
- **Message Frequency**: Up to 4 messages per month
- **Privacy Policy URL**: https://yourdomain.com/privacy

## Next Steps

1. Set up Grasshopper webhook endpoints
2. Implement STOP handler
3. Implement HELP handler
4. Implement opt-in confirmation handler
5. Test all message flows
6. Submit updated campaign information to Grasshopper for DCA2 approval

