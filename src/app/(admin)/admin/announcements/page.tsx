'use client';

import { useState } from 'react';
import { Megaphone, Plus, Send, Undo2 } from 'lucide-react';
import { AdminPageHeader, ConfirmButton, QuietButton } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { SelectField, TextAreaField, TextField } from '@/shared/ui/primitives/field';
import { useAdmin } from '../../_data/store';
import { dateTimeLabel } from '../../../_console/data/format';

export default function AnnouncementsPage() {

  const { state, run } = useAdmin();
  const [composing, setComposing] = useState(false);

  const published = state.announcements.filter((a) => a.state === 'published');

  return (
    <>
      <AdminPageHeader
        title="Announcements"
        description="What customers see on the banner, the status page and in their inbox."
        actions={
          <QuietButton onClick={() => setComposing((v) => !v)}>
            <Plus className="size-3.5" />
            {composing ? 'Close composer' : 'New announcement'}
          </QuietButton>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Published" value={String(published.length)} delta={{ value: 'Live on customer surfaces', direction: 'flat', period: '' }} />
        <StatTile label="Scheduled" value={String(state.announcements.filter((a) => a.state === 'scheduled').length)} delta={{ value: 'Queued to go out', direction: 'flat', period: '' }} />
        <StatTile label="Drafts" value={String(state.announcements.filter((a) => a.state === 'draft').length)} delta={{ value: 'Not visible yet', direction: 'flat', period: '' }} />
        <StatTile label="Banner impressions" value="4.1M" delta={{ value: '+12%', direction: 'up', period: 'this week' }} />
      </div>

      {composing ? (
        <Panel className="mb-4">
          <PanelHeader title="Compose" subtitle="Publishing writes to the customer surface immediately" />
          <form className="grid gap-4 lg:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
            <TextField label="Title" placeholder="Fee schedule update" wrapperClassName="lg:col-span-2" />
            <SelectField
              label="Surface"
              options={[
                { value: 'banner', label: 'Site banner' },
                { value: 'status', label: 'Status page' },
                { value: 'email', label: 'Email' },
                { value: 'inapp', label: 'In-app' },
              ]}
            />
            <SelectField
              label="Audience"
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'verified', label: 'Verified accounts' },
                { value: 'prime', label: 'Prime tier' },
                { value: 'eea', label: 'EEA customers' },
              ]}
            />
            <div className="lg:col-span-2">
              <TextAreaField label="Body" placeholder="Keep it to what changes and when." />
            </div>
            <div className="flex gap-2 lg:col-span-2">
              <ConfirmButton tone="brand">Save as draft</ConfirmButton>
              <QuietButton onClick={() => setComposing(false)}>Cancel</QuietButton>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {state.announcements.map((item) => (
          <Panel key={item.id}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{item.surface}</Badge>
              <Badge tone={item.state === 'published' ? 'up' : item.state === 'scheduled' ? 'accent' : 'neutral'} className="capitalize">
                {item.state}
              </Badge>
              <span className="ml-auto text-2xs text-fg-subtle">{dateTimeLabel(item.updatedAt)}</span>
            </div>
            <h2 className="flex items-start gap-2 font-display text-base font-semibold text-fg">
              <Megaphone className="mt-0.5 size-4 shrink-0 text-brand-soft" />
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.body}</p>
            <p className="mt-3 text-2xs text-fg-subtle">Author: {item.author}</p>
            <div className="mt-4 flex gap-2 border-t border-line pt-4">
              {item.state !== 'published' ? (
                <ConfirmButton onClick={() => run({ type: 'announcement/setState', id: item.id, state: 'published' })}>
                  <Send className="size-3.5" />
                  Publish
                </ConfirmButton>
              ) : (
                <QuietButton onClick={() => run({ type: 'announcement/setState', id: item.id, state: 'draft' })}>
                  <Undo2 className="size-3.5" />
                  Unpublish
                </QuietButton>
              )}
              {item.state === 'draft' ? (
                <QuietButton onClick={() => run({ type: 'announcement/setState', id: item.id, state: 'scheduled' })}>
                  Schedule
                </QuietButton>
              ) : null}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
