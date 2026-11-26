import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import type { AuthUser } from '../common/types';
import { ResumesService, type UploadedResumeFile } from './resumes.service';

@ApiTags('resumes')
@ApiBearerAuth()
@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumes: ResumesService) {}

  @Post()
  @HttpCode(202)
  @Roles(Role.CANDIDATE)
  @ApiOperation({ summary: 'Upload a resume (PDF/DOCX/TXT). Parsing runs asynchronously.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedResumeFile | undefined) {
    return this.resumes.upload(user, file);
  }

  @Get()
  @Roles(Role.CANDIDATE)
  list(@CurrentUser() user: AuthUser) {
    return this.resumes.listMine(user.id);
  }

  @Get(':id')
  @Roles(Role.CANDIDATE)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.getOwned(user, id);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Download the original file (owner, admin, or recruiter after blind screening)' })
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { resume, body } = await this.resumes.download(user, id);
    res.setHeader('Content-Type', resume.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${resume.fileName}"`);
    return new StreamableFile(body);
  }

  @Patch(':id/primary')
  @Roles(Role.CANDIDATE)
  primary(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.setPrimary(user, id);
  }

  @Post(':id/reprocess')
  @HttpCode(202)
  @Roles(Role.CANDIDATE)
  reprocess(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.reprocess(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.CANDIDATE)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.remove(user, id);
  }
}
