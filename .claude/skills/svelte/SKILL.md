---
name: svelte
description: This skill should be used when working with Svelte 3/4, including components, reactivity, stores, lifecycle, and component communication. Provides comprehensive knowledge of Svelte patterns, best practices, and reactive programming concepts.
---

# Svelte 3/4 Skill

This skill provides comprehensive knowledge and patterns for working with Svelte effectively in modern web applications.

## When to Use This Skill

Use this skill when:
- Building Svelte applications and components
- Working with Svelte reactivity and stores
- Implementing component communication patterns
- Managing component lifecycle
- Optimizing Svelte application performance
- Troubleshooting Svelte-specific issues
- Working with Svelte transitions and animations
- Integrating with external libraries

## Core Concepts

### Svelte Overview

Svelte is a compiler-based frontend framework that:
- **Compiles to vanilla JavaScript** - No runtime library shipped to browser
- **Reactive by default** - Variables are reactive, assignments trigger updates
- **Component-based** - Single-file components with `.svelte` extension
- **CSS scoping** - Styles are scoped to components by default
- **Built-in transitions** - Animation primitives included
- **Two-way binding** - Simple data binding with `bind:`

### Component Structure

Svelte components have three sections:

```svelte
<script>
  // JavaScript logic
  let count = 0;

  function increment() {
    count += 1;
  }
</script>

<style>
  /* Scoped CSS */
  button {
    background: #ff3e00;
    color: white;
  }
</style>

<!-- HTML template -->
<button on:click={increment}>
  Clicked {count} times
</button>
```

## Reactivity

### Reactive Declarations

Use `$:` for reactive statements and computed values:

```svelte
<script>
  let count = 0;

  // Reactive declaration - recomputes when count changes
  $: doubled = count * 2;

  // Reactive statement - runs when dependencies change
  $: console.log(`count is ${count}`);

  // Reactive block
  $: {
    console.log(`count is ${count}`);
    console.log(`doubled is ${doubled}`);
  }

  // Reactive if statement
  $: if (count >= 10) {
    alert('count is high!');
    count = 0;
  }
</script>
```

### Reactive Assignments

Reactivity is triggered by assignments:

```svelte
<script>
  let numbers = [1, 2, 3];

  function addNumber() {
    // This triggers reactivity
    numbers = [...numbers, numbers.length + 1];

    // This also works
    numbers.push(numbers.length + 1);
    numbers = numbers;
  }

  let obj = { foo: 'bar' };

  function updateObject() {
    // Reassignment triggers update
    obj.foo = 'baz';
    obj = obj;

    // Or use spread
    obj = { ...obj, foo: 'baz' };
  }
</script>
```

**Key Points:**
- Array methods like `push`, `pop` need reassignment to trigger updates
- Object property changes need reassignment
- Use spread operator for immutable updates

## Props

### Declaring Props

```svelte
<script>
  // Basic prop
  export let name;

  // Prop with default value
  export let greeting = 'Hello';

  // Readonly prop (convention)
  export let readonly count = 0;
</script>

<p>{greeting}, {name}!</p>
```

### Spread Props

```svelte
<script>
  // Forward all props to child
  export let info = {};
</script>

<Child {...info} />

<!-- Or forward unknown props -->
<Child {...$$restProps} />
```

### Prop Types with JSDoc

```svelte
<script>
  /**
   * @type {string}
   */
  export let name;

  /**
   * @type {'primary' | 'secondary'}
   */
  export let variant = 'primary';

  /**
   * @type {(event: CustomEvent) => void}
   */
  export let onSelect;
</script>
```

## Events

### DOM Events

```svelte
<script>
  function handleClick(event) {
    console.log('clicked', event.target);
  }
</script>

<!-- Basic event -->
<button on:click={handleClick}>Click me</button>

<!-- Inline handler -->
<button on:click={() => console.log('clicked')}>Click</button>

<!-- Event modifiers -->
<button on:click|preventDefault={handleClick}>Submit</button>
<button on:click|stopPropagation|once={handleClick}>Once</button>

<!-- Available modifiers -->
<!-- preventDefault, stopPropagation, passive, nonpassive, capture, once, self, trusted -->
```

### Component Events

Dispatch custom events from components:

```svelte
<!-- Child.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  function handleSelect(item) {
    dispatch('select', { item });
  }
</script>

<button on:click={() => handleSelect('foo')}>
  Select
</button>
```

```svelte
<!-- Parent.svelte -->
<script>
  function handleSelect(event) {
    console.log('selected:', event.detail.item);
  }
</script>

<Child on:select={handleSelect} />
```

### Event Forwarding

```svelte
<!-- Forward all events of a type -->
<button on:click>Click me</button>

<!-- The parent can now listen -->
<Child on:click={handleClick} />
```

## Bindings

### Two-Way Binding

```svelte
<script>
  let name = '';
  let agreed = false;
  let selected = 'a';
  let quantity = 1;
</script>

<!-- Text input -->
<input bind:value={name} />

<!-- Checkbox -->
<input type="checkbox" bind:checked={agreed} />

<!-- Radio buttons -->
<input type="radio" bind:group={selected} value="a" /> A
<input type="radio" bind:group={selected} value="b" /> B

<!-- Number input -->
<input type="number" bind:value={quantity} />

<!-- Select -->
<select bind:value={selected}>
  <option value="a">A</option>
  <option value="b">B</option>
</select>

<!-- Textarea -->
<textarea bind:value={content}></textarea>
```

### Component Bindings

```svelte
<!-- Bind to component props -->
<Child bind:value={parentValue} />

<!-- Bind to component instance -->
<Child bind:this={childComponent} />
```

### Element Bindings

```svelte
<script>
  let inputElement;
  let divWidth;
  let divHeight;
</script>

<!-- DOM element reference -->
<input bind:this={inputElement} />

<!-- Dimension bindings (read-only) -->
<div bind:clientWidth={divWidth} bind:clientHeight={divHeight}>
  {divWidth} x {divHeight}
</div>
```

## Stores

### Writable Stores

```javascript
// stores.js
import { writable } from 'svelte/store';

export const count = writable(0);

// With custom methods
function createCounter() {
  const { subscribe, set, update } = writable(0);

  return {
    subscribe,
    increment: () => update(n => n + 1),
    decrement: () => update(n => n - 1),
    reset: () => set(0)
  };
}

export const counter = createCounter();
```

```svelte
<script>
  import { count, counter } from './stores.js';

  // Manual subscription
  let countValue;
  const unsubscribe = count.subscribe(value => {
    countValue = value;
  });

  // Auto-subscription with $ prefix (recommended)
  // Automatically subscribes and unsubscribes
</script>

<p>Count: {$count}</p>
<button on:click={() => $count += 1}>Increment</button>

<p>Counter: {$counter}</p>
<button on:click={counter.increment}>Increment</button>
```

### Readable Stores

```javascript
import { readable } from 'svelte/store';

// Time store that updates every second
export const time = readable(new Date(), function start(set) {
  const interval = setInterval(() => {
    set(new Date());
  }, 1000);

  return function stop() {
    clearInterval(interval);
  };
});
```

### Derived Stores

```javascript
import { derived } from 'svelte/store';
import { time } from './stores.js';

export const elapsed = derived(
  time,
  $time => Math.round(($time - start) / 1000)
);

// Derived from multiple stores
export const combined = derived(
  [storeA, storeB],
  ([$a, $b]) => $a + $b
);

// Async derived
export const asyncDerived = derived(
  source,
  ($source, set) => {
    fetch(`/api/${$source}`)
      .then(r => r.json())
      .then(set);
  },
  'loading...' // initial value
);
```

### Store Contract

Any object with a `subscribe` method is a store:

```javascript
// Custom store implementation
function createCustomStore(initial) {
  let value = initial;
  const subscribers = new Set();

  return {
    subscribe(fn) {
      subscribers.add(fn);
      fn(value);
      return () => subscribers.delete(fn);
    },
    set(newValue) {
      value = newValue;
      subscribers.forEach(fn => fn(value));
    }
  };
}
```

## Lifecycle

### Lifecycle Functions

```svelte
<script>
  import { onMount, onDestroy, beforeUpdate, afterUpdate, tick } from 'svelte';

  // Called when component is mounted to DOM
  onMount(() => {
    console.log('mounted');

    // Return cleanup function (like onDestroy)
    return () => {
      console.log('cleanup on unmount');
    };
  });

  // Called before component is destroyed
  onDestroy(() => {
    console.log('destroying');
  });

  // Called before DOM updates
  beforeUpdate(() => {
    console.log('about to update');
  });

  // Called after DOM updates
  afterUpdate(() => {
    console.log('updated');
  });

  // Wait for next DOM update
  async function handleClick() {
    count += 1;
    await tick();
    // DOM is now updated
  }
</script>
```

**Key Points:**
- `onMount` runs only in browser, not during SSR
- `onMount` callbacks must be called during component initialization
- Use `tick()` to wait for pending state changes to apply to DOM

## Logic Blocks

### If Blocks

```svelte
{#if condition}
  <p>Condition is true</p>
{:else if otherCondition}
  <p>Other condition is true</p>
{:else}
  <p>Neither condition is true</p>
{/if}
```

### Each Blocks

```svelte
{#each items as item}
  <li>{item.name}</li>
{/each}

<!-- With index -->
{#each items as item, index}
  <li>{index}: {item.name}</li>
{/each}

<!-- With key for animations/reordering -->
{#each items as item (item.id)}
  <li>{item.name}</li>
{/each}

<!-- Destructuring -->
{#each items as { id, name }}
  <li>{id}: {name}</li>
{/each}

<!-- Empty state -->
{#each items as item}
  <li>{item.name}</li>
{:else}
  <p>No items</p>
{/each}
```

### Await Blocks

```svelte
{#await promise}
  <p>Loading...</p>
{:then value}
  <p>The value is {value}</p>
{:catch error}
  <p>Error: {error.message}</p>
{/await}

<!-- Short form (no loading state) -->
{#await promise then value}
  <p>The value is {value}</p>
{/await}
```

### Key Blocks

Force component recreation when value changes:

```svelte
{#key value}
  <Component />
{/key}
```

## Slots

### Basic Slots

```svelte
<!-- Card.svelte -->
<div class="card">
  <slot>
    <!-- Fallback content -->
    <p>No content provided</p>
  </slot>
</div>
```

```svelte
<Card>
  <p>Card content</p>
</Card>
```

### Named Slots

```svelte
<!-- Layout.svelte -->
<div class="layout">
  <header>
    <slot name="header"></slot>
  </header>
  <main>
    <slot></slot>
  </main>
  <footer>
    <slot name="footer"></slot>
  </footer>
</div>
```

```svelte
<Layout>
  <h1 slot="header">Page Title</h1>
  <p>Main content</p>
  <p slot="footer">Footer content</p>
</Layout>
```

### Slot Props

```svelte
<!-- List.svelte -->
<ul>
  {#each items as item}
    <li>
      <slot {item} index={items.indexOf(item)}>
        {item.name}
      </slot>
    </li>
  {/each}
</ul>
```

```svelte
<List {items} let:item let:index>
  <span>{index}: {item.name}</span>
</List>
```

## Transitions and Animations

### Transitions

```svelte
<script>
  import { fade, fly, slide, scale, blur, draw } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  let visible = true;
</script>

<!-- Basic transition -->
{#if visible}
  <div transition:fade>Fades in and out</div>
{/if}

<!-- With parameters -->
{#if visible}
  <div transition:fly={{ y: 200, duration: 300 }}>
    Flies in
  </div>
{/if}

<!-- Separate in/out transitions -->
{#if visible}
  <div in:fly={{ y: 200 }} out:fade>
    Different transitions
  </div>
{/if}

<!-- With easing -->
{#if visible}
  <div transition:slide={{ duration: 300, easing: quintOut }}>
    Slides with easing
  </div>
{/if}
```

### Custom Transitions

```javascript
function typewriter(node, { speed = 1 }) {
  const valid = node.childNodes.length === 1
    && node.childNodes[0].nodeType === Node.TEXT_NODE;

  if (!valid) {
    throw new Error('This transition only works on text nodes');
  }

  const text = node.textContent;
  const duration = text.length / (speed * 0.01);

  return {
    duration,
    tick: t => {
      const i = Math.trunc(text.length * t);
      node.textContent = text.slice(0, i);
    }
  };
}
```

### Animations

Animate elements when they move within an each block:

```svelte
<script>
  import { flip } from 'svelte/animate';
</script>

{#each items as item (item.id)}
  <li animate:flip={{ duration: 300 }}>
    {item.name}
  </li>
{/each}
```

## Actions

Reusable element-level logic:

```svelte
<script>
  function clickOutside(node, callback) {
    const handleClick = event => {
      if (!node.contains(event.target)) {
        callback();
      }
    };

    document.addEventListener('click', handleClick, true);

    return {
      destroy() {
        document.removeEventListener('click', handleClick, true);
      }
    };
  }

  function tooltip(node, text) {
    // Setup tooltip

    return {
      update(newText) {
        // Update when text changes
      },
      destroy() {
        // Cleanup
      }
    };
  }
</script>

<div use:clickOutside={() => visible = false}>
  Click outside to close
</div>

<button use:tooltip={'Click me!'}>
  Hover for tooltip
</button>
```

## Special Elements

### svelte:component

Dynamic component rendering:

```svelte
<script>
  import Red from './Red.svelte';
  import Blue from './Blue.svelte';

  let selected = Red;
</script>

<svelte:component this={selected} />
```

### svelte:element

Dynamic HTML elements:

```svelte
<script>
  let tag = 'h1';
</script>

<svelte:element this={tag}>Dynamic heading</svelte:element>
```

### svelte:window

```svelte
<script>
  let innerWidth;
  let innerHeight;

  function handleKeydown(event) {
    console.log(event.key);
  }
</script>

<svelte:window
  bind:innerWidth
  bind:innerHeight
  on:keydown={handleKeydown}
/>
```

### svelte:body and svelte:head

```svelte
<svelte:body on:mouseenter={handleMouseenter} />

<svelte:head>
  <title>Page Title</title>
  <meta name="description" content="..." />
</svelte:head>
```

### svelte:options

```svelte
<svelte:options
  immutable={true}
  accessors={true}
  namespace="svg"
/>
```

## Context API

Share data between components without prop drilling:

```svelte
<!-- Parent.svelte -->
<script>
  import { setContext } from 'svelte';

  setContext('theme', {
    color: 'dark',
    toggle: () => { /* ... */ }
  });
</script>
```

```svelte
<!-- Deeply nested child -->
<script>
  import { getContext } from 'svelte';

  const theme = getContext('theme');
</script>

<p>Current theme: {theme.color}</p>
```

**Key Points:**
- Context is not reactive by default
- Use stores in context for reactive values
- Context is available only during component initialization

## Best Practices

### Component Design

1. **Keep components focused** - Single responsibility
2. **Use composition** - Prefer slots over complex props
3. **Extract logic to stores** - Shared state in stores
4. **Use actions for DOM logic** - Reusable element behaviors
5. **Type with JSDoc** - Document prop types

### Reactivity

1. **Understand triggers** - Assignments trigger updates
2. **Use immutable patterns** - Spread for arrays/objects
3. **Avoid side effects in reactive statements** - Keep them pure
4. **Use derived stores** - For computed values from stores

### Performance

1. **Key each blocks** - Use unique keys for list items
2. **Use immutable option** - When data is immutable
3. **Lazy load components** - Dynamic imports
4. **Minimize store subscriptions** - Unsubscribe when done

### State Management

1. **Local state first** - Component variables for local state
2. **Stores for shared state** - Cross-component communication
3. **Context for configuration** - Theme, i18n, etc.
4. **Custom stores for logic** - Encapsulate complex state

## Common Patterns

### Async Data Loading

```svelte
<script>
  import { onMount } from 'svelte';

  let data = null;
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const response = await fetch('/api/data');
      data = await response.json();
    } catch (e) {
      error = e;
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <p>Loading...</p>
{:else if error}
  <p>Error: {error.message}</p>
{:else}
  <p>{data}</p>
{/if}
```

### Form Handling

```svelte
<script>
  let formData = {
    name: '',
    email: ''
  };
  let errors = {};
  let submitting = false;

  function validate() {
    errors = {};
    if (!formData.name) errors.name = 'Name is required';
    if (!formData.email) errors.email = 'Email is required';
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    submitting = true;
    try {
      await fetch('/api/submit', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
    } finally {
      submitting = false;
    }
  }
</script>

<form on:submit|preventDefault={handleSubmit}>
  <input bind:value={formData.name} />
  {#if errors.name}<span class="error">{errors.name}</span>{/if}

  <input bind:value={formData.email} type="email" />
  {#if errors.email}<span class="error">{errors.email}</span>{/if}

  <button disabled={submitting}>
    {submitting ? 'Submitting...' : 'Submit'}
  </button>
</form>
```

### Modal Pattern

```svelte
<!-- Modal.svelte -->
<script>
  export let open = false;

  function close() {
    open = false;
  }
</script>

{#if open}
  <div class="backdrop" on:click={close}>
    <div class="modal" on:click|stopPropagation>
      <slot />
      <button on:click={close}>Close</button>
    </div>
  </div>
{/if}
```

## Troubleshooting

### Common Issues

**Reactivity not working:**
- Check for proper assignment (reassign arrays/objects)
- Use `$:` for derived values
- Store subscriptions need `$` prefix

**Component not updating:**
- Verify prop changes trigger parent re-render
- Check key blocks for forced recreation
- Use `{#key}` to force component recreation

**Memory leaks:**
- Clean up subscriptions in `onDestroy`
- Return cleanup functions from `onMount`
- Unsubscribe from stores manually if not using `$`

**Styles not applying:**
- Check for `:global()` if targeting child components
- Verify CSS specificity
- Use `class:` directive properly

## References

- **Svelte Documentation**: https://svelte.dev/docs
- **Svelte Tutorial**: https://svelte.dev/tutorial
- **Svelte REPL**: https://svelte.dev/repl
- **Svelte Society**: https://sveltesociety.dev
- **GitHub**: https://github.com/sveltejs/svelte

## Related Skills

- **rollup** - Bundling Svelte applications
- **nostr-tools** - Nostr integration in Svelte apps
- **typescript** - TypeScript with Svelte
