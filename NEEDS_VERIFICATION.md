# NEEDS VERIFICATION — values the owner (Hotel Pelikan) must confirm

Everything listed here is a working placeholder so the platform runs end to end. Each is editable in the admin panel (`/admin/`). Items seeded with `demo = 1` show a DEMO stamp in the admin until the owner saves them. Agents: append, never delete; group by area; give the file/table where the value lives.

## Business identity and contact
- Legal name, NIPT, address, phone, email, WhatsApp/Viber, social links — settings `business`, `social`.
- Check-in / check-out times, reception hours.
- Whether "book direct = best rate" may be claimed.

## Rooms (stay)
- Room types, number of rooms per type, capacity, beds, size, amenities — table `products` (kind=room).
- Nightly prices per season — `products.price`, `room_rates`.
- Cancellation and deposit policy — `/kushtet/` terms.

## Experiences / activity packages
- Which packages the hotel actually runs or resells, durations, meeting points, guides, languages, schedules, capacities, prices — `products` (kind=experience), `sessions`.
- Visitor Centre and Pelican Tower opening hours and any entrance fees (only official sources may be shown).

## Shop
- Local products, producers, prices, stock, delivery/pickup terms — `products` (kind=goods).
- Gift card amounts and validity — `products` (kind=gift).
- Bundles and offers / promo codes — `products` (kind=bundle), `offers`.

## Payments
- Payment methods offered; bank name + IBAN for transfers — settings `payments`.
- Card payments: no merchant contract yet → TEST mode only. Real card payments need a POK merchant account (or BKT Virtual POS) and keys in env vars.
- EUR display rate — settings `currency`.

## Legal
- Privacy policy and terms drafts must be reviewed by the owner (and ideally a lawyer) before going live.
