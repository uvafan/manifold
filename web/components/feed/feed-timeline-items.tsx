import clsx from 'clsx'
import { AD_PERIOD, AD_REDEEM_REWARD } from 'common/boost'
import { run } from 'common/supabase/utils'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Col } from 'web/components/layout/col'
import { groupCommentsByContractsAndParents } from 'web/hooks/use-additional-feed-items'
import { DEBUG_FEED_CARDS, FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { db } from 'web/lib/supabase/db'
import { ContractsTable } from '../contract/contracts-table'
import { NewsArticle } from '../news/news-article'
import { FeedBetsItem } from './feed-bet-item'
import { FeedCommentItem } from './feed-comment-item'
import { Contract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { track } from 'web/lib/service/analytics'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { orderBy, sum, uniqBy } from 'lodash'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { TopicTag } from 'web/components/groups/topic-tag'
import { BoostsType } from 'web/lib/supabase/ads'

const MAX_PARENT_COMMENTS_PER_FEED_ITEM = 1
export const MIN_BET_AMOUNT = 20

export const FeedTimelineItems = (props: {
  feedTimelineItems: FeedTimelineItem[]
  boosts?: BoostsType
  user: User | null | undefined
}) => {
  const { user, boosts, feedTimelineItems: savedFeedTimelineItems } = props
  const savedFeedComments = filterDefined(
    savedFeedTimelineItems.map((item) => item.comments)
  ).flat()

  const boostedContractItems =
    boosts?.map((boost) => {
      const { market_data, ...rest } = boost
      return { contract: { ...market_data }, ...rest }
    }) ?? []

  const { parentCommentsByContractId, childCommentsByParentCommentId } =
    groupCommentsByContractsAndParents(savedFeedComments)

  const feedTimelineItems = mergePeriodic(
    savedFeedTimelineItems,
    boostedContractItems,
    AD_PERIOD
  )

  return (
    <>
      {feedTimelineItems.map((item) => {
        if ('manuallyCreatedFromContract' in item && item.contract) {
          return (
            <FeedContractAndRelatedItems
              user={user}
              contract={item.contract}
              parentComments={[]}
              childCommentsByParentCommentId={{}}
              key={item.contract.id}
            />
          )
        } else if ('ad_id' in item) {
          // Boosted contract
          const { contract } = item
          return (
            <FeedContractAndRelatedItems
              user={user}
              contract={contract}
              promotedData={{
                adId: item.ad_id,
                reward: AD_REDEEM_REWARD,
              }}
              parentComments={[]}
              childCommentsByParentCommentId={{}}
              key={item.ad_id}
            />
          )
        } else if (item.relatedItems) {
          const contracts = orderBy(
            filterDefined([
              item.contract,
              ...item.relatedItems.map((i) => i.contract),
            ]),
            'createdTime'
          )
          return (
            <FeedItemFrame
              item={item}
              key={item.id + '-feed-timeline-item'}
              moreItems={item.relatedItems}
              className="bg-canvas-0 border-canvas-0  w-full overflow-hidden rounded-2xl border shadow-md"
            >
              <Col className="px-2 pt-3">
                <ContractsTable contracts={contracts} hideHeader={true} />
              </Col>
              <CategoryTags
                categories={uniqBy(
                  contracts.map((c) => c.groupLinks ?? []).flat(),
                  'slug'
                )}
                className="mx-4 mb-3"
              />
            </FeedItemFrame>
          )
        } else if (item.contract) {
          // Organic contract
          const { contract } = item
          const parentComments = (
            item.comments ??
            parentCommentsByContractId[contract.id] ??
            []
          ).slice(0, MAX_PARENT_COMMENTS_PER_FEED_ITEM)
          return (
            <FeedContractAndRelatedItems
              user={user}
              contract={contract}
              parentComments={parentComments}
              childCommentsByParentCommentId={childCommentsByParentCommentId}
              item={item}
              key={item.id}
            />
          )
        } else if ('news' in item && item.news) {
          const { news } = item
          return (
            <FeedItemFrame
              item={item}
              key={news.id + 'feed-timeline-item'}
              className="bg-canvas-0 border-canvas-0 w-full overflow-hidden rounded-2xl border drop-shadow-md "
            >
              <NewsArticle
                author={(news as any)?.author}
                published_time={(news as any)?.published_time}
                {...news}
              />
              {item.contracts && item.contracts.length > 0 && (
                <Col className="px-2 pt-2 pb-3">
                  <span className="text-ink-500 text-sm">
                    Related Questions
                  </span>
                  <ContractsTable
                    contracts={item.contracts}
                    hideHeader={true}
                  />
                </Col>
              )}
              <CategoryTags categories={item.groups} className="mx-4 mb-3" />
            </FeedItemFrame>
          )
        }
      })}
    </>
  )
}

export function CategoryTags(props: {
  categories?: { slug: string; name: string }[]
  className?: string
  maxGroups?: number
}) {
  const { categories, className, maxGroups = 3 } = props
  if (!categories || categories.length <= 0) return null
  return (
    <Row className={clsx(className)}>
      {categories.slice(0, maxGroups).map((category) => (
        <TopicTag location={'feed card'} key={category.slug} topic={category} />
      ))}
    </Row>
  )
}

const FeedContractAndRelatedItems = (props: {
  contract: Contract
  user: User | null | undefined
  parentComments: ContractComment[]
  childCommentsByParentCommentId: Record<string, ContractComment[]>
  item?: FeedTimelineItem
  promotedData?: { adId: string; reward: number }
}) => {
  const {
    contract,
    promotedData,
    item,
    childCommentsByParentCommentId,
    parentComments,
  } = props
  const hasComments = parentComments && parentComments.length > 0
  const [hidden, setHidden] = useState(false)

  return (
    <FeedItemFrame item={item}>
      {!hidden ? (
        <FeedContractCard
          contract={contract}
          promotedData={promotedData}
          trackingPostfix="feed"
          hide={() => setHidden(true)}
          item={item}
          className="max-w-full"
        >
          {hasComments ? (
            <FeedCommentItem
              contract={contract}
              commentThreads={parentComments.map((parentComment) => ({
                parentComment,
                childComments:
                  childCommentsByParentCommentId[parentComment.id] ?? [],
              }))}
            />
          ) : (
            item?.betData &&
            item?.creatorDetails && (
              <FeedBetsItem
                contract={contract}
                betData={item.betData}
                creatorDetails={item.creatorDetails}
                answers={item.answers}
              />
            )
          )}
        </FeedContractCard>
      ) : (
        <Col
          className={clsx(
            'bg-canvas-0 border-canvas-0 rounded-xl border drop-shadow-md'
          )}
        >
          <Row className={'text-ink-400 mb-4 px-4 pt-3 text-sm'}>
            <i>Market hidden</i>
          </Row>
        </Col>
      )}
    </FeedItemFrame>
  )
}

const FeedItemFrame = (props: {
  item: FeedTimelineItem | undefined
  children: React.ReactNode
  className?: string
  moreItems?: FeedTimelineItem[]
}) => {
  const { moreItems, item, children, className } = props
  const items = filterDefined([item, ...(moreItems ?? [])])
  const [seenStart, setSeenStart] = useState(0)
  const [seenDuration, setSeenDuration] = usePersistentInMemoryState(
    sum(items.map((i) => i.seenDuration ?? 0)),
    `feed-items-${items
      .map((i) => i.id)
      .sort()
      .join('-')}-seen-duration`
  )

  const { ref } = useIsVisible(
    () => {
      if (DEBUG_FEED_CARDS) return
      setSeenStart(Date.now())
      if (seenDuration === 0) {
        items.forEach(async (i) => {
          run(
            db
              .from('user_feed')
              .update({ seen_time: new Date().toISOString() })
              .eq('id', i.id)
          )
          track('view feed item', { id: i.id, type: i.dataType })
        })
      }
    },
    false,
    items.length > 0,
    () => {
      if (DEBUG_FEED_CARDS) return
      const newSeenDuration =
        (Date.now() - seenStart) / items.length + seenDuration
      items.forEach(async (i) => {
        run(
          db
            .from('user_feed')
            .update({ seen_duration: newSeenDuration })
            .eq('id', i.id)
        )
      })
      setSeenDuration(newSeenDuration)
    }
  )

  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  )
}

// every period items in A, insert an item from B
function mergePeriodic<A, B>(a: A[], b: B[], period: number): (A | B)[] {
  const merged = []
  let j = 0
  for (let i = 0; i < a.length; ++i) {
    merged.push(a[i])
    if ((i + 1) % period === 0 && j < b.length) {
      merged.push(b[j])
      ++j
    }
  }
  return merged
}
