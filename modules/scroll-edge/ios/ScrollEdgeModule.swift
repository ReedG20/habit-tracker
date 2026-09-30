import ExpoModulesCore
import UIKit

public final class ScrollEdgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScrollEdge")

    View(ScrollEdgeContainerView.self) {
      Prop("edge") { (view: ScrollEdgeContainerView, edge: String?) in
        view.edgeName = edge ?? "bottom"
      }
      Prop("effectStyle") { (view: ScrollEdgeContainerView, style: String?) in
        view.styleName = style ?? "soft"
      }
    }
  }
}

/**
 * A view floating over one edge of a scroll view (a footer of buttons, say)
 * that gets the system's scroll edge effect beneath it, the way toolbars do:
 * content fades and blurs as it passes under, and only while it's there.
 *
 * The scroll view is found rather than passed in: the nearest one among this
 * view's siblings. On iOS before 26 this is a plain container.
 */
final class ScrollEdgeContainerView: ExpoView {
  var edgeName = "bottom" {
    didSet {
      guard edgeName != oldValue else { return }
      detach()
      attachIfNeeded()
    }
  }

  var styleName = "soft" {
    didSet { applyStyle() }
  }

  private var interaction: UIInteraction?
  private weak var scrollView: UIScrollView?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detach()
    } else {
      attachIfNeeded()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // The scroll view can mount after this view, or be swapped for another
    // (a loading state giving way to the real screen).
    attachIfNeeded()
  }

  private func attachIfNeeded() {
    #if compiler(>=6.2)
    guard #available(iOS 26.0, *), window != nil else { return }
    if interaction != nil, let scrollView, scrollView.window != nil { return }
    detach()
    guard let found = nearestScrollView() else { return }

    let interaction = UIScrollEdgeElementContainerInteraction()
    interaction.scrollView = found
    interaction.edge = edgeName == "top" ? .top : .bottom
    addInteraction(interaction)
    self.interaction = interaction
    scrollView = found
    applyStyle()
    #endif
  }

  private func detach() {
    if let interaction {
      removeInteraction(interaction)
    }
    interaction = nil
    scrollView = nil
  }

  private func applyStyle() {
    #if compiler(>=6.2)
    guard #available(iOS 26.0, *), let scrollView else { return }
    let effect = edgeName == "top" ? scrollView.topEdgeEffect : scrollView.bottomEdgeEffect
    switch styleName {
    case "hard":
      effect.style = .hard
    case "automatic":
      effect.style = .automatic
    default:
      effect.style = .soft
    }
    #endif
  }

  /// Breadth first through the siblings' subtrees, so the screen's scroll view
  /// wins over anything scrollable nested inside it (a multiline text field).
  private func nearestScrollView() -> UIScrollView? {
    guard let parent = superview else { return nil }
    var queue = parent.subviews.filter { $0 !== self }
    var index = 0
    while index < queue.count {
      let view = queue[index]
      index += 1
      if let scrollView = view as? UIScrollView, !(view is UITextView) {
        return scrollView
      }
      queue.append(contentsOf: view.subviews)
    }
    return nil
  }
}
