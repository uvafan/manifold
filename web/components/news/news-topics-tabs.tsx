import { HomeIcon } from '@heroicons/react/solid'
import { ReactNode } from 'react'
import { Col } from 'web/components/layout/col'
import { QueryUncontrolledTabs, Tab } from 'web/components/layout/tabs'
import { track } from 'web/lib/service/analytics'

import { buildArray } from 'common/util/array'
import { newsContent } from 'web/components/news/news-content'
import { NewsDashboard, NewsSidebar } from './news-dashboard'

export function NewsTopicsTabs(props: {
  homeContent?: ReactNode
  dontScroll?: boolean
  setSidebar?: (sidebarContent: ReactNode) => void
}) {
  const { homeContent, dontScroll, setSidebar } = props

  const topics = buildArray<Tab>(
    !!homeContent && {
      title: 'For you',
      inlineTabIcon: <HomeIcon className="h-4 w-4" />,
      content: homeContent as JSX.Element,
    },
    newsContent.map((content) => ({
      title: content.title,
      content: <NewsDashboard slug={content.slug} />,
      sidebar: <NewsSidebar slug={content.slug} />,
    }))
  )
  return (
    <Col className="w-full gap-2 px-1 pb-8 sm:mx-auto sm:gap-6 sm:px-2 lg:pr-4">
      <QueryUncontrolledTabs
        className={'bg-canvas-50 sticky top-0 z-20 px-1'}
        trackingName="news tabs"
        scrollToTop={!dontScroll}
        tabs={topics.map((tab) => ({
          ...tab,
          onClick: () => {
            track('news topic clicked', { tab: tab.title })
          },
        }))}
        onClick={
          setSidebar
            ? (_tabTitle, index) => {
                const sidebar = topics[index].sidebar
                if (sidebar) {
                  setSidebar(topics[index].sidebar)
                } else {
                  setSidebar(<></>)
                }
              }
            : undefined
        }
      />
    </Col>
  )
}
