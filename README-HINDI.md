# Debodih Premier League (DPL) — Supabase Website

यह DPL का Supabase-connected website project है। इसमें आपका DPL logo और PhonePe QR पहले से जोड़े गए हैं। Website navy blue + golden yellow + white theme में है और mobile-friendly है।

## Website में शामिल
- Home page और confirmed players count
- Player registration: First Name, Last Name, Player Type, Player Photo
- ₹199 PhonePe/UPI QR और payment screenshot upload
- Request code से registration status check
- Admin email/password login (Supabase Auth)
- Admin pending list, player photo और payment proof के private signed links
- Manual Approve/Reject; Approve पर DPL001, DPL002… नंबर database में atomic तरीके से बनता है
- Public confirmed players list (approved players only)
- Downloadable player card और CSV export
- Exact same payment screenshot का SHA-256 duplicate detection

## जरूरी सुरक्षा बातें
- `config.js` में केवल Project URL और Publishable Key है। यह browser में उपयोग होने वाली public key है। Secret/service-role key कभी `public` folder, GitHub या chat में न डालें।
- Payment screenshot bucket private रहता है। Admin को ही signed URL दिया जाता है।
- Player photo bucket भी private है; public roster को Edge Function सीमित समय वाला signed URL देता है।
- Admin को Approve दबाने से पहले अपने PhonePe/UPI account में वास्तविक ₹199 receipt देखना जरूरी है। Screenshot अपने आप payment प्रमाणित नहीं करता।
- Duplicate detection exact file hash पर है। Resized/cropped/recompressed screenshot को हमेशा exact duplicate नहीं पकड़ा जा सकता; admin को manually मिलान करना होगा।
- Launch से पहले abuse protection/rate limiting और CAPTCHA जोड़ना उचित होगा।

## आपके Supabase project में पहले से किए गए काम
- `players` table और उसके fields
- `admin_users` table और आपका admin user
- RLS और Storage buckets `player-photos`, `payment-screenshots`
- Storage policies

इस project में `supabase/migrations/001_dpl_finish_setup.sql` एक finishing migration है। इसे SQL Editor में पूरा paste करके RUN करना होगा। यह पुराने registrations delete नहीं करता।

## Deploy करने के लिए अभी बाकी
1. `supabase/migrations/001_dpl_finish_setup.sql` को Supabase SQL Editor में चलाएँ।
2. Supabase Edge Functions deploy करें: `submit-registration`, `registration-status`, `public-players`, `admin-list`, `admin-review`.
3. Static website के लिए Cloudflare Pages पर `public` folder deploy करें (या GitHub repository connect करें)।
4. Supabase Auth → URL Configuration में deployed website URL को Site URL और Redirect URLs में add करें।
5. पहले test registration करें; admin dashboard से payment manually verify करके approve/reject test करें।

### Edge Functions deploy (computer/terminal required)
Supabase CLI install करके project link करें, फिर project folder में:

```bash
supabase login
supabase link --project-ref mpxrzpicbbglpsvzyeih
supabase functions deploy submit-registration --no-verify-jwt
supabase functions deploy registration-status --no-verify-jwt
supabase functions deploy public-players --no-verify-jwt
supabase functions deploy admin-list
supabase functions deploy admin-review
```

`--no-verify-jwt` सिर्फ उन public functions के लिए है जिनमें request body के स्तर पर कोई user login जरूरी नहीं; Admin functions पर JWT verification चालू रहता है और function code admin membership भी verify करता है। Supabase CLI deployment के बाद public functions के CORS/API access को test करें।

## Important: अभी live website नहीं है
यह ZIP source code है, live/deployed website नहीं। Supabase project बनना और code तैयार होना अलग-अलग चरण हैं। Hosting और Edge Functions deploy होने के बाद ही public registration link काम करेगा।
