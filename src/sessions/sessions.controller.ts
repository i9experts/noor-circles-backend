import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { UserRole }     from '../user/user.schema';
import { SessionsService } from './sessions.service';

const CURRICULUM_THEMES = [
  { month: 1,  theme: 'Identity',    title: 'Who am I?',               description: 'Exploring Muslim identity, fitrah, and our unique purpose in the world.',                         color: 'teal'   },
  { month: 2,  theme: 'Honesty',     title: 'The Power of Truth',      description: 'Understanding sidq — truthfulness in speech, action, and character.',                             color: 'gold'   },
  { month: 3,  theme: 'Family',      title: 'Roots & Bonds',           description: 'Strengthening relationships with parents, siblings, and extended family through Islamic values.',  color: 'green'  },
  { month: 4,  theme: 'Gratitude',   title: 'The Art of Shukr',        description: 'Learning to see blessings and express gratitude as a daily practice.',                            color: 'purple' },
  { month: 5,  theme: 'Courage',     title: 'Standing for Truth',      description: 'Developing moral courage to do what is right even when it is difficult.',                         color: 'teal'   },
  { month: 6,  theme: 'Friendship',  title: 'Choosing Your Circle',    description: 'The Islamic perspective on friendship, influence, and building righteous relationships.',          color: 'gold'   },
  { month: 7,  theme: 'Patience',    title: 'The Strength of Sabr',    description: 'Understanding patience in hardship, delay, and obedience as a spiritual superpower.',             color: 'green'  },
  { month: 8,  theme: 'Generosity',  title: 'Open Hands, Open Heart',  description: 'Exploring sadaqah, sharing, and the spiritual rewards of giving.',                               color: 'purple' },
  { month: 9,  theme: 'Body',        title: 'Amanah of the Body',      description: 'Understanding our body as a trust from Allah — health, modesty, and self-care.',                  color: 'teal'   },
  { month: 10, theme: 'Knowledge',   title: 'Seekers of Ilm',          description: 'The obligation and virtue of seeking knowledge in all aspects of life.',                          color: 'gold'   },
  { month: 11, theme: 'Community',   title: 'One Ummah',               description: 'Connecting with the wider Muslim community and our responsibilities toward it.',                  color: 'green'  },
  { month: 12, theme: 'Legacy',      title: 'What Will You Leave?',    description: 'Reflecting on impact, purpose, and the legacy we want to build in this world and the next.',     color: 'purple' },
];

function buildCurriculumResponse() {
  const currentMonth = new Date().getMonth() + 1;
  const themes = CURRICULUM_THEMES.map((t) => ({
    ...t,
    status: t.month < currentMonth ? 'completed' : t.month === currentMonth ? 'current' : 'upcoming',
  }));
  return { currentMonth, totalMonths: 12, totalSessions: 40, themes };
}

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /** GET /sessions */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getSessions() {
    return buildCurriculumResponse();
  }

  /** GET /sessions/curriculum */
  @Get('curriculum')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getCurriculum() {
    return buildCurriculumResponse();
  }

  /** GET /sessions/stats */
  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getStats() {
    return this.sessionsService.getStats();
  }

  /** GET /sessions/list */
  @Get('list')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getSessionsList() {
    return this.sessionsService.getAllSessions();
  }
}
