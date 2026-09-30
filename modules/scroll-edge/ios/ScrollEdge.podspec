Pod::Spec.new do |s|
  s.name           = 'ScrollEdge'
  s.version        = '1.0.0'
  s.summary        = 'The system scroll edge effect under custom bars'
  s.description    = 'Puts iOS 26 scroll edge effects under views that float over a scroll view.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift}"
end
