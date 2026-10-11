import React from 'react';
import { Columns3, LayoutGrid, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { STATUS_OPTIONS } from '@/components/StatusPill';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  'Design',
  'Engineering',
  'Content',
  'Research',
  'Data',
  'Ops',
  'Community',
  'Security',
];

const SORTS = [
  { value: '-created_date', label: 'Newest first' },
  { value: '-reward_usdc', label: 'Highest reward' },
  { value: 'reward_usdc', label: 'Lowest reward' },
];

const SIZES = [
  { value: 'all', label: 'Any size' },
  { value: 'quick', label: 'Quick win' },
  { value: 'standard', label: 'Standard' },
  { value: 'deep', label: 'Deep work' },
];

function LayoutToggle({ layout, onChange }) {
  const options = [
    { value: 'board', label: 'Board view', icon: Columns3 },
    { value: 'grid', label: 'Card grid view', icon: LayoutGrid },
  ];

  return (
    <div className="flex items-center rounded-full border border-border p-0.5" role="group" aria-label="Change board layout">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-label={option.label}
          aria-pressed={layout === option.value}
          title={option.label}
          data-testid={`view-${option.value}`}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full transition',
            layout === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <option.icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export default function BoardToolbar({ value, onChange, layout, onLayoutChange, count, dirty, onReset }) {
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.search}
            onChange={(event) => set({ search: event.target.value })}
            placeholder="Search bounties…"
            aria-label="Search bounties"
            data-testid="search-input"
            className="h-9 rounded-full pl-9 text-sm"
          />
        </div>

        <Select value={value.category} onValueChange={(next) => set({ category: next })}>
          <SelectTrigger className="h-9 w-[9.5rem] rounded-full text-sm" aria-label="Category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.status} onValueChange={(next) => set({ status: next })}>
          <SelectTrigger className="h-9 w-[9.5rem] rounded-full text-sm" aria-label="Status" data-testid="status-select">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline" data-testid="result-count">
          {count} {count === 1 ? 'bounty' : 'bounties'}
        </span>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Filter and sort"
              data-testid="filter-button"
              className="h-9 w-9 rounded-full border-border"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Order by</Label>
              <Select value={value.sort} onValueChange={(next) => set({ sort: next })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((sort) => (
                    <SelectItem key={sort.value} value={sort.value}>
                      {sort.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Work size</Label>
              <Select value={value.complexity} onValueChange={(next) => set({ complexity: next })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((size) => (
                    <SelectItem key={size.value} value={size.value}>
                      {size.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!dirty}
              onClick={onReset}
              className="w-full justify-center gap-2 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset filters
            </Button>
          </PopoverContent>
        </Popover>

        <span className="hidden text-xs text-muted-foreground lg:inline">Layout</span>
        <LayoutToggle layout={layout} onChange={onLayoutChange} />
      </div>
    </div>
  );
}