import React from 'react';
import _ from 'underscore';
import ReactTimeout from 'react-timeout';
import Column from './Column';
import TaskWrapper from './TaskWrapper';

import {
  PanResponder,
  Animated,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';

const { width, height } = Dimensions.get('window');
class Board extends React.Component {
  MAX_RANGE = 100;
  MAX_DEG = 30;
  TRESHOLD = 35;

  verticalOffset = 0;
  verticalOffsetScrolling = 0;
  hasBeenScroll = false;

  state = {
    rotate: new Animated.Value(0),
    startingX: 0,
    startingY: 0,
    x: 0,
    y: 0,
    movingMode: false,
  };

  panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => this.state.movingMode,
    onMoveShouldSetPanResponder: () => this.state.movingMode,
    onPanResponderTerminationRequest: () => !this.state.movingMode,
    onPanResponderMove: this.onPanResponderMove.bind(this),
    onPanResponderRelease: this.onPanResponderRelease.bind(this),
    onPanResponderTerminate: this.onPanResponderRelease.bind(this),
  });

  componentDidMount() {
    this.unsubscribeFromMovingMode();
  }

  componentDidUpdate() {
    this.unsubscribeFromMovingMode();
  }

  onPanResponderMove(event, gesture) {
    const leftTopCornerX = this.state.startingX + gesture.dx;
    const leftTopCornerY = this.state.startingY + gesture.dy;
    if (this.state.movingMode) {
      const draggedItem = this.state.draggedItem;
      this.x = event.nativeEvent.pageX;
      this.y = event.nativeEvent.pageY;
      const columnAtPosition = this.props.rowRepository.move(
        draggedItem,
        this.x,
        this.y,
      );
      if (columnAtPosition) {
        let { scrolling, offset } = this.props.rowRepository.scrollingPosition(
          columnAtPosition,
          this.x,
          this.y,
        );
        if (this.shouldScroll(scrolling, offset, columnAtPosition)) {
          this.scroll(columnAtPosition, draggedItem, offset);
        }
      }

      this.setState({
        x: leftTopCornerX,
        y: leftTopCornerY,
      });
      // tu:du:
      if (
        gesture.moveX > gesture.x0 &&
        gesture.moveX + 75 > width &&
        !this.hasBeenScroll
      ) {
        this.containerScrollView.scrollTo({
          x:
            this.verticalOffset +
            (gesture.moveX - gesture.x0 < 25
              ? width - 25
              : gesture.moveX - gesture.x0),
        });
        this.hasBeenScroll = true;
      }
      if (
        gesture.moveX < gesture.x0 &&
        gesture.moveX < 75 &&
        !this.hasBeenScroll
      ) {
        this.containerScrollView.scrollTo({
          x:
            this.verticalOffset -
            (gesture.x0 - gesture.moveX < 25
              ? width - 25
              : gesture.x0 - gesture.moveX),
        });
        this.hasBeenScroll = true;
      }
    }
  }

  shouldScroll(scrolling, offset, column) {
    const placeToScroll =
      (offset < 0 && column.scrollOffset() > 0) ||
      (offset > 0 && column.scrollOffset() < column.contentHeight());

    return scrolling && offset != 0 && placeToScroll;
  }

  onScrollingStarted() {
    this.scrolling = true;
  }

  onScrollingEnded() {
    this.scrolling = false;
  }

  isScrolling() {
    return this.scrolling;
  }

  scroll(column, draggedItem, anOffset) {
    if (!this.isScrolling()) {
      this.onScrollingStarted();
      const scrollOffset = column.scrollOffset() + 70 * anOffset;
      this.props.rowRepository.setScrollOffset(column.id(), scrollOffset);
      // TODO: Maybe investigate why listView sometimes not a function
      if (column && column.listView() && column.listView === "function") {
        column.listView().scrollTo({ y: scrollOffset });
      }
    }

    this.props.rowRepository.move(draggedItem, this.x, this.y);
    let { scrolling, offset } = this.props.rowRepository.scrollingPosition(
      column,
      this.x,
      this.y,
    );
    if (this.shouldScroll(scrolling, offset, column)) {
      this.props.requestAnimationFrame(() => {
        this.scroll(column, draggedItem, offset);
      });
    }
  }

  endMoving() {
    this.setState({ movingMode: false });
    const { srcColumnId, draggedItem } = this.state;
    const { rowRepository, onDragEnd } = this.props;
    rowRepository.show(draggedItem.columnId(), draggedItem);
    rowRepository.notify(draggedItem.columnId(), 'reload');

    const destColumnId = draggedItem.columnId();
    onDragEnd && onDragEnd(srcColumnId, destColumnId, draggedItem);
    // tu:du:
    if (this.verticalOffset !== this.verticalOffsetScrolling) {
      this.verticalOffset = this.verticalOffsetScrolling;
      this.props.rowRepository.updateColumnsLayoutAfterVisibilityChanged();
    }
    this.hasBeenScroll = false;
  }

  onPanResponderRelease(e, gesture) {
    this.x = null;
    this.y = null;
    if (this.state.movingMode) {
      this.rotateBack();
      this.props.setTimeout(this.endMoving.bind(this), 200);
    } else if (this.isScrolling()) {
      this.unsubscribeFromMovingMode();
    }
  }

  rotateTo(value) {
    Animated.spring(this.state.rotate, {
      toValue: value,
      duration: 5000,
      useNativeDriver: true,
    }).start();
  }

  rotate() {
    this.rotateTo(this.MAX_DEG);
  }

  rotateBack() {
    this.rotateTo(0);
  }

  open(row) {
    this.props.open(row);
  }

  cancelMovingSubscription() {
    this.props.clearTimeout(this.movingSubscription);
  }

  unsubscribeFromMovingMode() {
    this.cancelMovingSubscription();
  }

  onPressIn(columnId, item, columnCallback) {
    if (item.isLocked()) {
      return;
    }
    return () => {
      if (!item || (item.isLocked() && this.isScrolling())) {
        this.unsubscribeFromMovingMode();
        return;
      }
      this.movingSubscription = this.props.setTimeout(() => {
        if (!item || !item.layout()) {
          return;
        }
        const { x, y } = item.layout();
        this.props.rowRepository.hide(columnId, item);
        this.setState({
          movingMode: true,
          draggedItem: item,
          srcColumnId: item.columnId(),
          startingX: x,
          startingY: y,
          x,
          y,
        });
        columnCallback();
        this.rotate();
      }, this.longPressDuration());
    };
  }

  longPressDuration() {
    return Platform.OS === 'ios' ? 1000 : 1000;
  }

  onPress(item) {
    if (item.isLocked()) {
      return;
    }

    return () => {
      this.unsubscribeFromMovingMode();

      if (item.isLocked()) {
        return;
      }

      if (!this.state.movingMode) {
        this.open(item.row());
      } else {
        this.endMoving();
      }
    };
  }

  onScroll(event) {
    // tu:du:
    this.verticalOffsetScrolling = event.nativeEvent.contentOffset.x;
    this.cancelMovingSubscription();
  }

  onScrollEnd(event) {
    this.props.rowRepository.updateColumnsLayoutAfterVisibilityChanged();
    this.verticalOffset = event.nativeEvent.contentOffset.x;
  }

  movingStyle(zIndex) {
    const interpolatedRotateAnimation = this.state.rotate.interpolate({
      inputRange: [-this.MAX_RANGE, 0, this.MAX_RANGE],
      outputRange: [`-${this.MAX_DEG}deg`, '0deg', `${this.MAX_DEG}deg`],
    });
    return {
      transform: [{ rotate: interpolatedRotateAnimation }],
      position: 'absolute',
      zIndex,
      elevation: zIndex,
      top: this.state.y,
      left: this.verticalOffset + this.state.x,
    };
  }

  movingTask() {
    const { draggedItem, movingMode } = this.state;
    const zIndex = movingMode ? 1 : -1;
    const data = {
      item: draggedItem,
      hidden: !movingMode,
      style: this.movingStyle(zIndex),
    };
    return this.renderWrapperRow(data);
  }

  renderWrapperRow(data) {
    const { renderRow } = this.props;
    return (
      <TaskWrapper {...data}>
        {renderRow && data.item && renderRow(data.item.row())}
      </TaskWrapper>
    );
  }

  render() {
    const columns = this.props.rowRepository.columns();
    const columnWrappers = columns.map((column) => {
      const columnComponent = (
        <Column
          column={column}
          movingMode={this.state.movingMode}
          rowRepository={this.props.rowRepository}
          onPressIn={this.onPressIn.bind(this)}
          onPress={this.onPress.bind(this)}
          onPanResponderMove={this.onPanResponderMove.bind(this)}
          onPanResponderRelease={this.onPanResponderRelease.bind(this)}
          renderWrapperRow={this.renderWrapperRow.bind(this)}
          onScrollingStarted={this.onScrollingStarted.bind(this)}
          onScrollingEnded={this.onScrollingEnded.bind(this)}
          unsubscribeFromMovingMode={this.cancelMovingSubscription.bind(this)}
        />
      );
      return this.props.renderColumnWrapper(
        column.data(),
        column.index(),
        columnComponent,
      );
    });

    return (
      <ScrollView
        ref={(ref) => (this.containerScrollView = ref)}
        scrollEventThrottle={16}
        style={this.props.style}
        contentContainerStyle={this.props.contentContainerStyle}
        scrollEnabled={!this.state.movingMode}
        onScroll={this.onScroll.bind(this)}
        onScrollEndDrag={this.onScrollEnd.bind(this)}
        onMomentumScrollEnd={this.onScrollEnd.bind(this)}
        horizontal={true}
        {...this.panResponder.panHandlers}
      >
        {this.movingTask()}
        {columnWrappers}
      </ScrollView>
    );
  }
}

export default ReactTimeout(Board);
