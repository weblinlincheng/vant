import { ref, computed, watch, nextTick, reactive, provide } from 'vue';

// Utils
import { createNamespace, isDef } from '../utils';
import { isHidden } from '../utils/dom/style';
import { preventDefault } from '../utils/dom/event';
import {
  getScrollTop,
  getElementTop,
  getRootScrollTop,
  setRootScrollTop,
} from '../utils/dom/scroll';

// Composition
import { useEventListener } from '@vant/use';
import { useRect } from '../composition/use-rect';
import { useTouch } from '../composition/use-touch';
import { useScroller } from '../composition/use-scroller';

export const INDEX_BAR_KEY = 'vanIndexBar';

function genAlphabet() {
  const indexList = [];
  const charCodeOfA = 'A'.charCodeAt(0);

  for (let i = 0; i < 26; i++) {
    indexList.push(String.fromCharCode(charCodeOfA + i));
  }

  return indexList;
}

const [createComponent, bem] = createNamespace('index-bar');

export default createComponent({
  props: {
    zIndex: [Number, String],
    highlightColor: String,
    sticky: {
      type: Boolean,
      default: true,
    },
    stickyOffsetTop: {
      type: Number,
      default: 0,
    },
    indexList: {
      type: Array,
      default: genAlphabet,
    },
  },

  emits: ['select'],

  setup(props, { emit, slots }) {
    const rootRef = ref();
    const activeAnchor = ref();
    const children = reactive([]);

    const touch = useTouch();
    const scroller = useScroller(rootRef);

    provide(INDEX_BAR_KEY, { props, children });

    const sidebarStyle = computed(() => {
      if (isDef(props.zIndex)) {
        return {
          zIndex: 1 + props.zIndex,
        };
      }
    });

    const highlightStyle = computed(() => {
      if (props.highlightColor) {
        return {
          color: props.highlightColor,
        };
      }
    });

    const getScrollerRect = () => {
      if (scroller.value.getBoundingClientRect) {
        return useRect(scroller);
      }
      return {
        top: 0,
        left: 0,
      };
    };

    const getAnchorTop = (element, scrollerRect) => {
      if (scroller.value === window || scroller.value === document.body) {
        return getElementTop(element);
      }

      const rect = useRect(element);
      return rect.top - scrollerRect.top + getScrollTop(scroller);
    };

    const getActiveAnchor = (scrollTop, rects) => {
      for (let i = children.length - 1; i >= 0; i--) {
        const prevHeight = i > 0 ? rects[i - 1].height : 0;
        const reachTop = props.sticky ? prevHeight + props.stickyOffsetTop : 0;

        if (scrollTop + reachTop >= rects[i].top) {
          return i;
        }
      }

      return -1;
    };

    const onScroll = () => {
      if (isHidden(rootRef.value)) {
        return;
      }

      const { sticky, indexList } = props;
      const scrollTop = getScrollTop(scroller.value);
      const scrollerRect = getScrollerRect();

      const rects = children.map((item) => ({
        height: item.height,
        top: getAnchorTop(item.rootRef, scrollerRect),
      }));

      const active = getActiveAnchor(scrollTop, rects);

      activeAnchor.value = indexList[active];

      if (sticky) {
        children.forEach((item, index) => {
          const { state, height, rootRef } = item;
          if (index === active || index === active - 1) {
            const rect = rootRef.getBoundingClientRect();
            state.left = rect.left;
            state.width = rect.width;
          } else {
            state.left = null;
            state.width = null;
          }

          if (index === active) {
            state.active = true;
            state.top =
              Math.max(props.stickyOffsetTop, rects[index].top - scrollTop) +
              scrollerRect.top;
          } else if (index === active - 1) {
            const activeItemTop = rects[active].top - scrollTop;
            state.active = activeItemTop > 0;
            state.top = activeItemTop + scrollerRect.top - height;
          } else {
            state.active = false;
          }
        });
      }
    };

    useEventListener('scroll', onScroll, { target: scroller });

    watch(
      () => props.indexList,
      () => {
        nextTick(onScroll);
      }
    );

    const renderIndexes = () =>
      props.indexList.map((index) => {
        const active = index === activeAnchor.value;
        return (
          <span
            class={bem('index', { active })}
            style={active ? highlightStyle.value : null}
            data-index={index}
          >
            {index}
          </span>
        );
      });

    const scrollToElement = (element) => {
      const { index } = element.dataset;
      if (!index) {
        return;
      }

      const match = children.filter(
        (item) => String(item.props.index) === index
      );

      if (match[0]) {
        match[0].rootRef.scrollIntoView();

        if (props.sticky && props.stickyOffsetTop) {
          setRootScrollTop(getRootScrollTop() - props.stickyOffsetTop);
        }

        emit('select', match[0].index);
      }
    };

    const onClick = (event) => {
      scrollToElement(event.target);
    };

    let touchActiveIndex;
    const onTouchMove = (event) => {
      touch.move(event);

      if (touch.direction.value === 'vertical') {
        preventDefault(event);

        const { clientX, clientY } = event.touches[0];
        const target = document.elementFromPoint(clientX, clientY);
        if (target) {
          const { index } = target.dataset;

          /* istanbul ignore else */
          if (touchActiveIndex !== index) {
            touchActiveIndex = index;
            scrollToElement(target);
          }
        }
      }
    };

    return () => (
      <div ref={rootRef} class={bem()}>
        <div
          class={bem('sidebar')}
          style={sidebarStyle.value}
          onClick={onClick}
          onTouchstart={touch.start}
          onTouchmove={onTouchMove}
        >
          {renderIndexes()}
        </div>
        {slots.default?.()}
      </div>
    );
  },
});
