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
 * Highlights its slot content with a decorative overlay mark.
 *
 * @example
 * ```vue
 * <Highlight :options="{ color: { palette: 'fluorescent', swatch: 'pink' } }">
 *   Highlight this
 * </Highlight>
 * ```
 */
export const Highlight = defineComponent({
  name: "Highlight",
  // Attrs are spread onto the rendered element explicitly below.
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
