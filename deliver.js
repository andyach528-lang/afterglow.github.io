const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

async function runDeliveries() {
  console.log('AfterGlow delivery run:', new Date().toISOString());

  // Find all messages due today or overdue
  const today = new Date().toISOString().split('T')[0];
  
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('status', 'stored')
    .eq('delivery_trigger', 'date')
    .lte('delivery_date', today);

  if (error) {
    console.error('Database error:', error);
    return;
  }

  console.log(`Found ${messages.length} message(s) to deliver`);

  for (const msg of messages) {
    try {
      // Generate a signed URL — valid for 30 days
      const { data: urlData } = await supabase
        .storage
        .from('messages')
        .createSignedUrl(msg.storage_path, 60 * 60 * 24 * 30);

      const secureLink = urlData?.signedUrl;

      // Send the delivery email
      await resend.emails.send({
        from: 'AfterGlow <support@afterglow.org.in>',
        to: msg.recipient_email,
        subject: `A message has been left for you`,
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1A1208">
            <div style="font-size:24px;font-weight:300;letter-spacing:4px;color:#B8935A;margin-bottom:8px">
              AfterGlow
            </div>
            <div style="font-size:11px;font-family:monospace;color:#6B5B45;letter-spacing:2px;
                        margin-bottom:40px">MESSAGES ACROSS TIME</div>
            <p style="font-size:18px;font-weight:300;line-height:1.6">
              Dear ${msg.recipient_name},
            </p>
            <p style="font-size:16px;font-weight:300;line-height:1.8;color:#6B5B45">
              Someone who cares deeply about you left a message in our care — 
              to be delivered to you ${msg.delivery_occasion ? 'on <em>' + msg.delivery_occasion + '</em>' : 'today'}.
            </p>
            <p style="font-size:16px;font-weight:300;line-height:1.8;color:#6B5B45">
              That moment is now.
            </p>
            <div style="text-align:center;margin:40px 0">
              <a href="${secureLink}" 
                 style="background:#1A1208;color:#FAF7F2;padding:16px 32px;
                        text-decoration:none;font-family:monospace;
                        font-size:13px;letter-spacing:2px">
                OPEN YOUR MESSAGE
              </a>
            </div>
            <p style="font-size:13px;color:#6B5B45;font-family:monospace;
                      letter-spacing:1px;line-height:1.8">
              This link is private and made only for you.<br>
              It will remain active for 30 days.<br><br>
              If you have any questions, write to us at<br>
              support@afterglow.org.in
            </p>
            <div style="margin-top:40px;padding-top:20px;border-top:1px solid #D4C4A8;
                        font-size:11px;color:#6B5B45;font-family:monospace;letter-spacing:1px">
              AfterGlow · a Kamala Laxmi Enterprise initiative<br>
              131/1201, Anantya CHS, Pantnagar, Ghatkopar (E)<br>
              Mumbai — 400075, Maharashtra, India
            </div>
          </div>
        `
      });

      // Mark as delivered in database
      await supabase
        .from('messages')
        .update({ 
          status: 'delivered', 
          delivered_at: new Date().toISOString() 
        })
        .eq('id', msg.id);

      console.log(`Delivered to ${msg.recipient_email} — ref ${msg.id}`);

    } catch (err) {
      console.error(`Failed for ${msg.id}:`, err.message);
      // Will retry automatically tomorrow
    }
  }
  
  console.log('Delivery run complete.');
}

runDeliveries();