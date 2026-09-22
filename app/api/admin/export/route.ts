// =============================================================================
// ACC Auction Portal — Complete Tournament Spreadsheet Export Route Handler (§16, §49)
// =============================================================================

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPermissionContext } from '@/lib/permissions/context';

export async function GET() {
  try {
    const { appUser } = await getCurrentUser();
    if (!appUser) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const supabase = await createClient();
    const context = await getUserPermissionContext(supabase, appUser);
    if (!context.isAdmin) {
      return new NextResponse('Forbidden: Admin access required', { status: 403 });
    }

    const adminClient = createAdminClient();
    const seasonId = context.activeSeason?.id || '00000000-0000-0000-0000-000000000001';

    // 1. Fetch Players
    const { data: players } = await adminClient
      .from('player_season_registrations')
      .select(`
        id,
        bucket,
        base_price,
        payment_status,
        is_auction_eligible,
        programme,
        academic_year,
        branch,
        cricheroes_url,
        players (
          roll_number,
          full_name,
          mobile
        ),
        player_skill_profiles (
          derived_player_type,
          batting_style,
          bowling_style
        )
      `)
      .eq('season_id', seasonId);

    // 2. Fetch Franchises
    const { data: franchises } = await adminClient
      .from('franchises')
      .select('*')
      .eq('season_id', seasonId);

    // 3. Fetch Lots & Sales
    const { data: lots } = await adminClient
      .from('auction_lots')
      .select(`
        lot_number,
        bucket,
        round,
        status,
        base_price,
        current_price,
        highest_bidder_franchise_id,
        player_season_registrations (
          players (
            roll_number,
            full_name
          )
        )
      `)
      .eq('season_id', seasonId)
      .order('lot_number', { ascending: true });

    // 4. Fetch Event Ledger
    const { data: events } = await adminClient
      .from('auction_events')
      .select('*')
      .eq('season_id', seasonId)
      .order('sequence_number', { ascending: true });

    // Generate CSV output with clear section headers
    let csv = `=== AVANTHI CRICKET CARNIVAL (ACC) TOURNAMENT DATASET ===\n`;
    csv += `Export Timestamp: ${new Date().toISOString()}\n`;
    csv += `Season: ${context.activeSeason?.name || 'ACC 2026'}\n\n`;

    // SECTION 1: PLAYERS
    csv += `--- SECTION 1: REGISTERED PLAYERS ---\n`;
    csv += `Roll Number,Full Name,Programme,Academic Year,Branch,Bucket,Base Price,Role,Payment Status,Auction Eligible,CricHeroes URL\n`;
    if (players) {
      for (const p of players as any[]) {
        const roll = p.players?.roll_number || '';
        const name = `"${(p.players?.full_name || '').replace(/"/g, '""')}"`;
        const prog = p.programme || '';
        const year = p.academic_year || '';
        const branch = p.branch || '';
        const bucket = p.bucket || '';
        const base = p.base_price || '';
        const role =
          p.player_skill_profiles?.[0]?.derived_player_type ||
          p.player_skill_profiles?.derived_player_type ||
          '';
        const pay = p.payment_status || '';
        const eligible = p.is_auction_eligible ? 'YES' : 'NO';
        const cric = `"${(p.cricheroes_url || '').replace(/"/g, '""')}"`;
        csv += `${roll},${name},${prog},${year},${branch},${bucket},${base},${role},${pay},${eligible},${cric}\n`;
      }
    }

    // SECTION 2: FRANCHISES
    csv += `\n--- SECTION 2: FRANCHISES ---\n`;
    csv += `Franchise Name,Short Code,Coordinator Name,Coordinator Mobile\n`;
    if (franchises) {
      for (const f of franchises as any[]) {
        const name = `"${(f.name || '').replace(/"/g, '""')}"`;
        const code = f.short_name || '';
        const coord = `"${(f.faculty_coordinator_name || '').replace(/"/g, '""')}"`;
        const mobile = f.faculty_coordinator_mobile || '';
        csv += `${name},${code},${coord},${mobile}\n`;
      }
    }

    // SECTION 3: SQUAD ROSTERS & LOTS
    csv += `\n--- SECTION 3: AUCTION LOTS & SQUADS ---\n`;
    const franchiseMap = new Map((franchises || []).map((f: any) => [f.id, f.name]));
    csv += `Lot #,Player Roll,Player Name,Bucket,Round,Status,Acquisition Type,Price,Buyer Franchise\n`;
    if (lots) {
      for (const l of lots as any[]) {
        const num = l.lot_number;
        const roll = l.player_season_registrations?.players?.roll_number || '';
        const name = `"${(l.player_season_registrations?.players?.full_name || '').replace(/"/g, '""')}"`;
        const bucket = l.bucket || '';
        const round = l.round || 1;
        const status = l.status || '';
        const acqType = status === 'allotted' ? 'ALLOTTED' : status === 'sold' ? 'SOLD' : status.toUpperCase();
        const price = l.current_price ?? l.base_price ?? '';
        const team = l.highest_bidder_franchise_id
          ? `"${franchiseMap.get(l.highest_bidder_franchise_id) || l.highest_bidder_franchise_id}"`
          : 'None';
        csv += `${num},${roll},${name},${bucket},${round},${status},${acqType},${price},${team}\n`;
      }
    }

    // SECTION 4: AUCTION AUDIT & EVENT LEDGER
    csv += `\n--- SECTION 4: AUCTION AUDIT & EVENT LEDGER ---\n`;
    csv += `Seq #,Event Type,Lot ID,Franchise,Price,Reason,Timestamp\n`;
    if (events) {
      for (const e of events as any[]) {
        const seq = e.sequence_number;
        const type = e.event_type;
        const lot = e.auction_lot_id || '';
        const team = e.franchise_id ? `"${franchiseMap.get(e.franchise_id) || e.franchise_id}"` : '';
        const price = e.price ?? '';
        const reason = `"${(e.reason || '').replace(/"/g, '""')}"`;
        const time = e.created_at || '';
        csv += `${seq},${type},${lot},${team},${price},${reason},${time}\n`;
      }
    }

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="acc_tournament_data_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: any) {
    return new NextResponse(`Export failed: ${err?.message || 'Server error'}`, { status: 500 });
  }
}
