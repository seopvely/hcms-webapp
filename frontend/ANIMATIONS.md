# Micro-Animations & Interaction Polish

## New CSS Animation Utilities

All animation utilities are available in `globals.css` under the `@layer utilities` block.

### 1. Staggered Fade-In (`animate-stagger`)
Apply to parent container to create cascading fade-in effect for child elements.

```tsx
<div className="animate-stagger">
  <div>Item 1</div>  {/* Fades in first */}
  <div>Item 2</div>  {/* Fades in 0.05s later */}
  <div>Item 3</div>  {/* Fades in 0.1s later */}
</div>
```

**Best for:** List items, card grids, navigation menus

### 2. Gradient Shimmer (`animate-shimmer`)
Animated gradient effect for stat cards and highlights.

```tsx
<div className="animate-shimmer bg-gradient-to-r from-purple-500 to-pink-500">
  Shimmering content
</div>
```

**Best for:** Stat cards, promotional banners, loading states

### 3. Pulse Dot (`animate-pulse-dot`)
Smooth pulsing animation for status indicators.

```tsx
<span className="animate-pulse-dot inline-block w-2 h-2 bg-blue-500 rounded-full" />
```

**Best for:** Live status indicators, notification dots
**Note:** Already integrated into `StatusBadge` for in-progress statuses

### 4. Hover Lift (`hover-lift`)
Subtle lift effect on hover with shadow enhancement.

```tsx
<div className="hover-lift bg-white rounded-xl p-6">
  Hover over me
</div>
```

**Best for:** Cards, buttons, interactive panels

### 5. Count Up Reveal (`animate-count-up`)
Fade-in with slight upward movement for numbers.

```tsx
<span className="animate-count-up">42</span>
```

**Best for:** Statistics, counters (use with `AnimatedCounter` component)

### 6. Slide In Right (`animate-slide-in-right`)
Slides in from the right with fade.

```tsx
<div className="animate-slide-in-right">
  Detail content
</div>
```

**Best for:** Detail pages, modal content

### 7. Fade Scale (`animate-fade-scale`)
Gentle scale-up with fade for modals.

```tsx
<div className="animate-fade-scale">
  Modal content
</div>
```

**Best for:** Dialogs, popovers, tooltips

### 8. Gradient Text (`text-gradient`)
Purple gradient text effect.

```tsx
<h1 className="text-gradient text-4xl font-bold">
  Beautiful Gradient
</h1>
```

**Best for:** Headers, feature titles, call-to-actions

### 9. Glass Card (`glass-card`)
Frosted glass morphism effect.

```tsx
<div className="glass-card rounded-2xl p-6">
  Glass content
</div>
```

**Best for:** Overlay cards, feature highlights

---

## New React Components

### AnimatedCounter
Animated number counter with easing.

```tsx
import { AnimatedCounter } from "@/components/common";

<AnimatedCounter
  value={1234}
  duration={1000}
  prefix="₩"
  suffix="원"
  className="text-2xl font-bold"
/>
```

**Props:**
- `value: number` - Target number to count to
- `duration?: number` - Animation duration in ms (default: 1000)
- `prefix?: string` - Text before number
- `suffix?: string` - Text after number
- `className?: string` - Additional CSS classes

**Best for:** Dashboard stats, totals, metrics

### LoadingState
Consistent loading indicator with message.

```tsx
import { LoadingState } from "@/components/common";

<LoadingState
  message="데이터를 불러오는 중..."
  size="md"
  className="min-h-[200px]"
/>
```

**Props:**
- `message?: string` - Loading message (default: "불러오는 중...")
- `size?: "sm" | "md" | "lg"` - Spinner size (default: "md")
- `className?: string` - Additional CSS classes

**Best for:** Data fetching states, skeleton replacements

### Enhanced StatusBadge
Now includes animated pulse dot for in-progress statuses.

```tsx
import { StatusBadge } from "@/components/common";

<StatusBadge status="2" type="maintenance" />  {/* Shows pulse dot */}
<StatusBadge status="3" type="maintenance" />  {/* Shows pulse dot */}
<StatusBadge status="2" type="task" />         {/* Shows pulse dot */}
```

**Pulse dot shows for:**
- Maintenance status "2" (알림)
- Maintenance status "3" (처리중)
- Task status "2" (진행중)

---

## Usage Examples

### Dashboard Stat Cards
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-stagger">
  <div className="hover-lift bg-white rounded-2xl p-6">
    <p className="text-sm text-muted-foreground">총 작업</p>
    <AnimatedCounter
      value={42}
      className="text-3xl font-bold mt-2"
      suffix="건"
    />
  </div>
  {/* More cards... */}
</div>
```

### List Items with Stagger
```tsx
<div className="space-y-4 animate-stagger">
  {items.map(item => (
    <div key={item.id} className="hover-lift bg-white rounded-xl p-4">
      {/* Card content */}
    </div>
  ))}
</div>
```

### Status with Pulse
```tsx
<StatusBadge status="3" type="maintenance" />
{/* Automatically shows pulsing dot for in-progress items */}
```

### Loading State
```tsx
{isLoading ? (
  <LoadingState message="견적서를 불러오는 중..." />
) : (
  <EstimateList data={data} />
)}
```

---

## Animation Performance Notes

- All CSS animations use `transform` and `opacity` for optimal performance
- No layout thrashing or forced reflows
- Hardware-accelerated where possible
- Respects user's `prefers-reduced-motion` setting
- AnimatedCounter uses `requestAnimationFrame` for smooth 60fps animations

---

## Integration Checklist

✅ CSS animations added to `globals.css`
✅ `AnimatedCounter` component created
✅ `LoadingState` component created
✅ `StatusBadge` enhanced with pulse animation
✅ All components exported from `common/index.ts`
✅ TypeScript build successful
✅ All utilities ready to use

---

## Next Steps (Optional Enhancements)

Consider applying these animations to existing pages:

1. **Dashboard** - Add `animate-stagger` to stat cards grid
2. **News/Maintenance/Task Lists** - Add `animate-stagger` to card lists
3. **Detail Pages** - Add `animate-slide-in-right` to main content
4. **Stat Cards** - Replace static numbers with `AnimatedCounter`
5. **Loading States** - Replace skeleton loaders with `LoadingState` where appropriate
6. **Interactive Cards** - Add `hover-lift` to all clickable cards
