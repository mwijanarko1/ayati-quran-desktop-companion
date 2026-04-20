import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GatewayConnectionBanner } from './GatewayConnectionBanner';
import { GatewaySetupModal } from './GatewaySetupModal';

describe('gateway setup surfaces', () => {
  it('does not show local gateway setup commands in the connection banner or modal', () => {
    render(
      <>
        <GatewayConnectionBanner
          connected={false}
          error={null}
          onShowSetupGuide={vi.fn()}
        />
        <GatewaySetupModal
          isOpen={true}
          onClose={vi.fn()}
          onCheckConnection={vi.fn()}
        />
      </>
    );

    expect(screen.queryByText(/openclaw/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/openclaw gateway/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/api key/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ai provider required/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connection settings/i })).toBeInTheDocument();
  });

  it('shows the provider banner when the configured endpoint is missing', () => {
    render(
      <GatewayConnectionBanner
        connected={false}
        error="fetch failed"
        onShowSetupGuide={vi.fn()}
      />
    );

    expect(screen.getByText(/gateway not connected/i)).toBeInTheDocument();
    expect(screen.getByText(/fetch failed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connection settings/i })).toBeInTheDocument();
  });
});
