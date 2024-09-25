import { Job } from '../queue'
import Journey from './Journey'
import { JourneyState } from './JourneyState'
import { JourneyUserStep } from './JourneyStep'
import { logger } from '../config/logger'

interface JourneyProcessParams {
    entrance_id: number
}

export default class JourneyProcessJob extends Job {
    static $name = 'journey_process_job'

    static from(params: JourneyProcessParams): JourneyProcessJob {
        return new this(params)
    }

    static async handler({ entrance_id }: JourneyProcessParams) {
        logger.info({ entrance_id: entrance_id }, 'KELINDI - JourneyProcessJob.handler' )
        const entrance = await JourneyUserStep.find(entrance_id)

        // invalid entrance id
        if (!entrance) {
            return
        }

        // make sure journey is still active
        if (!await Journey.exists(qb => qb.where('id', entrance.journey_id).where('published', true))) {
            return
        }

        await JourneyState.resume(entrance)
    }
}
