import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NoteEditor } from './note-editor';

describe('NoteEditor', () => {
  let component: NoteEditor;
  let fixture: ComponentFixture<NoteEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NoteEditor],
    }).compileComponents();

    fixture = TestBed.createComponent(NoteEditor);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
