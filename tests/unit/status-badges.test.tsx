import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PlayerStatusBadge, AuctionStatusBadge } from '@/components/acc/status-badges';
import type { PlayerStatus, AuctionStatus } from '@/lib/acc/types';

describe('PlayerStatusBadge Resilience & Server Rendering', () => {
  it('renders standard PlayerStatus values cleanly without errors', () => {
    const standardStatuses: PlayerStatus[] = [
      'REGISTERED',
      'UNDER_REVIEW',
      'APPROVED',
      'IN_AUCTION',
      'SOLD',
      'UNSOLD',
    ];

    for (const status of standardStatuses) {
      const html = renderToString(<PlayerStatusBadge status={status} />);
      expect(html).toBeTruthy();
      expect(html).toContain('</span>');
    }
  });

  it('renders expanded lifecycle and registration statuses cleanly', () => {
    const lifecycleStatuses: PlayerStatus[] = [
      'DRAFT',
      'PENDING_VERIFICATION',
      'PENDING',
      'ELIGIBLE',
      'UPCOMING',
      'REJECTED',
      'BLOCKED',
    ];

    for (const status of lifecycleStatuses) {
      const html = renderToString(<PlayerStatusBadge status={status} />);
      expect(html).toBeTruthy();
    }
  });

  it('handles lowercase, snake_case, and whitespace status strings without crashing', () => {
    const rawStatuses = [
      'draft',
      'pending_verification',
      'pending_payment',
      'eligible',
      'ineligible',
      'under_review',
      'in_auction',
      'sold',
      'unsold',
      '  approved  ',
    ];

    for (const raw of rawStatuses) {
      expect(() => {
        const html = renderToString(<PlayerStatusBadge status={raw as any} />);
        expect(html).toBeTruthy();
      }).not.toThrow();
    }
  });

  it('handles undefined, null, empty string, and completely unknown statuses safely', () => {
    expect(() => {
      const html1 = renderToString(<PlayerStatusBadge status={undefined} />);
      expect(html1).toContain('Under Review');
    }).not.toThrow();

    expect(() => {
      const html2 = renderToString(<PlayerStatusBadge status={null} />);
      expect(html2).toContain('Under Review');
    }).not.toThrow();

    expect(() => {
      const html3 = renderToString(<PlayerStatusBadge status={'' as any} />);
      expect(html3).toContain('Under Review');
    }).not.toThrow();

    expect(() => {
      const html4 = renderToString(<PlayerStatusBadge status={'NON_EXISTENT_STATUS' as any} />);
      expect(html4).toContain('NON EXISTENT STATUS');
    }).not.toThrow();
  });
});

describe('AuctionStatusBadge Resilience & Server Rendering', () => {
  it('renders standard AuctionStatus values cleanly without errors', () => {
    const auctionStatuses: AuctionStatus[] = ['IDLE', 'LIVE', 'PAUSED', 'SOLD', 'UNSOLD'];

    for (const status of auctionStatuses) {
      const html = renderToString(<AuctionStatusBadge status={status} />);
      expect(html).toBeTruthy();
    }
  });

  it('handles lowercase strings, undefined, null, and unknown status safely', () => {
    expect(() => {
      const html1 = renderToString(<AuctionStatusBadge status={'live' as any} />);
      expect(html1).toContain('Live');
    }).not.toThrow();

    expect(() => {
      const html2 = renderToString(<AuctionStatusBadge status={undefined} />);
      expect(html2).toContain('Idle');
    }).not.toThrow();

    expect(() => {
      const html3 = renderToString(<AuctionStatusBadge status={null} />);
      expect(html3).toContain('Idle');
    }).not.toThrow();

    expect(() => {
      const html4 = renderToString(<AuctionStatusBadge status={'CUSTOM_STATUS' as any} />);
      expect(html4).toContain('CUSTOM_STATUS');
    }).not.toThrow();
  });
});
