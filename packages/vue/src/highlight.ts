import {
  defineComponent,
  h,
  ref,
  computed,
  type PropType,
  type SlotsType,
  type VNode,
} from "vue";
import { useHighlight } from "./use-highlight.js";
import type { HighlightOptions } from "@highlighters/core";

/**
 * Component that highlights its slot content with a realistic mark. Text stays
 * intact and selectable — the mark is a decorative overlay.
 *
 * @example
 * ```vue
 * <Highlight :options="{ preset: 'wet', color: 'pink' }">
 *   Highlight this
 * </Highlight>
 * ```
 */
export const Highlight = defineComponent({
  name: "Highlight",
  // Consumer attrs land on the rendered element via the explicit `attrs` spread below.
  inheritAttrs: false,
  props: {
    as: {
      type: String as PropType<keyof HTMLElementTagNameMap>,
      default: "span",
    },
    options: {
      type: Object as PropType<HighlightOptions>,
      default: undefined,
    },
  },
  slots: Object as SlotsType<{ default: () => VNode[] }>,
  setup(props, { slots, attrs, expose }) {
    const elRef = ref<HTMLElement | null>(null);
    const options = computed<HighlightOptions | undefined>(() => props.options);

    const getHandle = useHighlight(elRef, options);
    expose({ el: elRef, handle: getHandle });

    return () => h(props.as, { ...attrs, ref: elRef }, slots.default?.());
  },
});
